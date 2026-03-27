import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnnotationComment, MarkerPosition } from "../types";
import { querySelectorSafely } from "../selector";
import { useAnnotation } from "../useAnnotation";
import {
  getMarkerPagePosition,
  getInitials,
  getThreadCount,
  getTopLevelComments,
  markerPositionsEqual,
  measurePoint,
  measureRect,
} from "../utils";

const MARKER_OFFSET_X = 10;
const MARKER_OFFSET_Y = 10;
const DRAG_DISTANCE_THRESHOLD = 4;
const ZERO_STACK_OFFSET = { x: 0, y: 0 } satisfies MarkerStackOffset;

type MarkerStackOffset = { x: number; y: number };

type DragSession = {
  pointerId: number;
  threadId: string;
  startClientX: number;
  startClientY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  stackedOffset: MarkerStackOffset;
  target: HTMLElement | null;
  hasMoved: boolean;
};

type MarkerStyle = CSSProperties & {
  "--marker-base-x": string;
  "--marker-base-y": string;
};

function getMarkerStyle(position: MarkerPosition, stackedOffset: MarkerStackOffset): MarkerStyle {
  return {
    "--marker-base-x": `${position.x + MARKER_OFFSET_X + stackedOffset.x}px`,
    "--marker-base-y": `${position.y + MARKER_OFFSET_Y + stackedOffset.y}px`,
    transform:
      "translate(calc(var(--marker-base-x) + var(--marker-delta-x, 0px)), calc(var(--marker-base-y) + var(--marker-delta-y, 0px)))",
  };
}

function getThreadId(node: HTMLElement): string | null {
  return node.dataset.threadId ?? null;
}

function setMarkerDelta(node: HTMLElement, deltaX: number, deltaY: number) {
  node.style.setProperty("--marker-delta-x", `${deltaX}px`);
  node.style.setProperty("--marker-delta-y", `${deltaY}px`);
}

function clearMarkerDelta(node: HTMLElement) {
  node.style.removeProperty("--marker-delta-x");
  node.style.removeProperty("--marker-delta-y");
}

function setMarkerBasePosition(
  node: HTMLElement,
  position: MarkerPosition,
  stackedOffset: MarkerStackOffset,
) {
  node.style.setProperty("--marker-base-x", `${position.x + MARKER_OFFSET_X + stackedOffset.x}px`);
  node.style.setProperty("--marker-base-y", `${position.y + MARKER_OFFSET_Y + stackedOffset.y}px`);
}

export function CommentMarkers() {
  const {
    activeThreadId,
    comments,
    currentPath,
    openThreadComposer,
    showResolved,
    updateThreadRect,
  } = useAnnotation();
  const [positions, setPositions] = useState<Record<string, MarkerPosition>>({});
  const markerElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const positionsRef = useRef<Record<string, MarkerPosition>>({});
  const topLevelCommentsRef = useRef<AnnotationComment[]>([]);
  const topLevelCommentMapRef = useRef(new Map<string, AnnotationComment>());
  const stackedOffsetsRef = useRef<Record<string, MarkerStackOffset>>({});
  const dragSessionRef = useRef<DragSession | null>(null);
  const ignoreClickThreadIdRef = useRef<string | null>(null);
  const resizeFrameIdRef = useRef(0);

  const topLevelComments = useMemo(() => {
    return getTopLevelComments(comments).filter(
      (comment) => comment.page_path === currentPath && (showResolved || !comment.resolved),
    );
  }, [comments, currentPath, showResolved]);

  const stackedOffsets = useMemo(() => {
    const groups = new Map<string, string[]>();

    for (const comment of topLevelComments) {
      const position = positions[comment.id];
      if (!position) {
        continue;
      }

      const key = `${Math.round(position.x)}:${Math.round(position.y)}`;
      const group = groups.get(key);
      if (group) {
        group.push(comment.id);
      } else {
        groups.set(key, [comment.id]);
      }
    }

    const nextOffsets: Record<string, MarkerStackOffset> = {};

    for (const ids of groups.values()) {
      ids.forEach((id, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);

        nextOffsets[id] = {
          x: column * 10,
          y: row * 10,
        };
      });
    }

    return nextOffsets;
  }, [positions, topLevelComments]);

  const syncMarkerPositions = useCallback((syncState: boolean) => {
    const previousPositions = positionsRef.current;
    const nextPositions = { ...previousPositions };
    const visibleIds = new Set<string>();
    let hasChanges = false;

    for (const comment of topLevelCommentsRef.current) {
      visibleIds.add(comment.id);

      if (dragSessionRef.current?.threadId === comment.id) {
        continue;
      }

      const nextPosition = getMarkerPagePosition(
        comment.rect,
        querySelectorSafely(comment.selector),
      );

      if (!nextPosition) {
        if (comment.id in nextPositions) {
          delete nextPositions[comment.id];
          hasChanges = true;
        }
        continue;
      }

      if (!markerPositionsEqual(previousPositions[comment.id], nextPosition)) {
        nextPositions[comment.id] = nextPosition;
        hasChanges = true;
      }

      const markerNode = markerElementsRef.current.get(comment.id);
      if (markerNode) {
        setMarkerBasePosition(
          markerNode,
          nextPosition,
          stackedOffsetsRef.current[comment.id] ?? ZERO_STACK_OFFSET,
        );
      }
    }

    for (const id of Object.keys(previousPositions)) {
      if (!visibleIds.has(id)) {
        delete nextPositions[id];
        hasChanges = true;
      }
    }

    const resolvedPositions = hasChanges ? nextPositions : previousPositions;
    positionsRef.current = resolvedPositions;

    if (syncState && hasChanges) {
      setPositions(resolvedPositions);
    }
  }, []);

  const setMarkerElement = useCallback((threadId: string, node: HTMLButtonElement | null) => {
    if (!node) {
      markerElementsRef.current.delete(threadId);
      return;
    }

    markerElementsRef.current.set(threadId, node);

    const position = positionsRef.current[threadId];
    if (!position) {
      return;
    }

    setMarkerBasePosition(node, position, stackedOffsetsRef.current[threadId] ?? ZERO_STACK_OFFSET);
  }, []);

  const finishDrag = useCallback(
    async (event: ReactPointerEvent<HTMLButtonElement>, session: DragSession) => {
      const currentPosition = positionsRef.current[session.threadId];
      if (!currentPosition) {
        clearMarkerDelta(event.currentTarget);
        return;
      }

      if (!session.hasMoved) {
        clearMarkerDelta(event.currentTarget);
        return;
      }

      const nextPosition: MarkerPosition = {
        ...currentPosition,
        x:
          event.clientX +
          window.scrollX -
          session.pointerOffsetX -
          MARKER_OFFSET_X -
          session.stackedOffset.x,
        y:
          event.clientY +
          window.scrollY -
          session.pointerOffsetY -
          MARKER_OFFSET_Y -
          session.stackedOffset.y,
      };

      if (!markerPositionsEqual(currentPosition, nextPosition)) {
        const nextPositions = {
          ...positionsRef.current,
          [session.threadId]: nextPosition,
        };

        positionsRef.current = nextPositions;
        setPositions(nextPositions);
      }

      setMarkerBasePosition(event.currentTarget, nextPosition, session.stackedOffset);
      clearMarkerDelta(event.currentTarget);

      ignoreClickThreadIdRef.current = session.threadId;
      await updateThreadRect(
        session.threadId,
        measurePoint(
          nextPosition.x - window.scrollX,
          nextPosition.y - window.scrollY,
          session.target ?? undefined,
        ),
      );
    },
    [updateThreadRect],
  );

  const handleMarkerClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const threadId = getThreadId(event.currentTarget);
      if (!threadId) {
        return;
      }

      if (ignoreClickThreadIdRef.current === threadId) {
        ignoreClickThreadIdRef.current = null;
        event.preventDefault();
        return;
      }

      openThreadComposer(threadId, measureRect(event.currentTarget));
    },
    [openThreadComposer],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const threadId = getThreadId(event.currentTarget);
      const session = dragSessionRef.current;
      if (
        !threadId ||
        !session ||
        session.threadId !== threadId ||
        session.pointerId !== event.pointerId
      ) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragSessionRef.current = null;
      clearMarkerDelta(event.currentTarget);
      syncMarkerPositions(false);
    },
    [syncMarkerPositions],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const threadId = getThreadId(event.currentTarget);
    if (!threadId) {
      return;
    }

    const comment = topLevelCommentMapRef.current.get(threadId);
    const markerRect = event.currentTarget.getBoundingClientRect();

    dragSessionRef.current = {
      pointerId: event.pointerId,
      threadId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pointerOffsetX: event.clientX - markerRect.left,
      pointerOffsetY: event.clientY - markerRect.top,
      stackedOffset: stackedOffsetsRef.current[threadId] ?? ZERO_STACK_OFFSET,
      target: querySelectorSafely(comment?.selector ?? null),
      hasMoved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const threadId = getThreadId(event.currentTarget);
    const session = dragSessionRef.current;
    if (
      !threadId ||
      !session ||
      session.threadId !== threadId ||
      session.pointerId !== event.pointerId
    ) {
      return;
    }

    const pointerDistance = Math.hypot(
      event.clientX - session.startClientX,
      event.clientY - session.startClientY,
    );

    if (pointerDistance >= DRAG_DISTANCE_THRESHOLD) {
      session.hasMoved = true;
    }

    if (!session.hasMoved) {
      return;
    }

    event.preventDefault();
    setMarkerDelta(
      event.currentTarget,
      event.clientX - session.startClientX,
      event.clientY - session.startClientY,
    );
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const threadId = getThreadId(event.currentTarget);
      const session = dragSessionRef.current;
      if (
        !threadId ||
        !session ||
        session.threadId !== threadId ||
        session.pointerId !== event.pointerId
      ) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragSessionRef.current = null;
      void finishDrag(event, session);
    },
    [finishDrag],
  );

  useEffect(() => {
    topLevelCommentsRef.current = topLevelComments;
    topLevelCommentMapRef.current = new Map(
      topLevelComments.map((comment) => [comment.id, comment]),
    );

    const frameId = window.requestAnimationFrame(() => {
      syncMarkerPositions(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [syncMarkerPositions, topLevelComments]);

  useEffect(() => {
    stackedOffsetsRef.current = stackedOffsets;

    for (const [threadId, node] of markerElementsRef.current) {
      const position = positionsRef.current[threadId];
      if (!position) {
        continue;
      }

      setMarkerBasePosition(node, position, stackedOffsets[threadId] ?? ZERO_STACK_OFFSET);
    }
  }, [stackedOffsets]);

  useEffect(() => {
    const scheduleResizeSync = () => {
      if (resizeFrameIdRef.current !== 0) {
        return;
      }

      resizeFrameIdRef.current = window.requestAnimationFrame(() => {
        resizeFrameIdRef.current = 0;
        syncMarkerPositions(true);
      });
    };

    scheduleResizeSync();
    window.addEventListener("resize", scheduleResizeSync);

    return () => {
      window.removeEventListener("resize", scheduleResizeSync);
      window.cancelAnimationFrame(resizeFrameIdRef.current);
      resizeFrameIdRef.current = 0;
    };
  }, [syncMarkerPositions]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-2147483602"
      data-annotation-overlay-root="true"
    >
      {topLevelComments.map((comment) => {
        const position = positions[comment.id];
        if (!position) {
          return null;
        }

        const threadCount = getThreadCount(comments, comment.id);
        const stackedOffset = stackedOffsets[comment.id] ?? ZERO_STACK_OFFSET;

        return (
          <motion.div>
            <Button
              key={comment.id}
              className={cn(
                "pointer-events-auto absolute top-0 left-0 inline-flex size-8 cursor-grab touch-none rounded-full text-xs shadow-lg transition-colors select-none active:cursor-grabbing",
                comment.id === activeThreadId
                  ? "bg-primary text-primary-foreground"
                  : "bg-foreground text-background",
                comment.resolved && "opacity-35",
              )}
              data-thread-id={comment.id}
              onClick={handleMarkerClick}
              onPointerCancel={handlePointerCancel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              ref={(node) => setMarkerElement(comment.id, node)}
              style={getMarkerStyle(position, stackedOffset)}
              title={`${comment.author} · ${comment.resolved ? "Resolved" : "Open"} · ${threadCount} message${
                threadCount === 1 ? "" : "s"
              }`}
            >
              <Badge className="pointer-events-none absolute top-0 right-0 size-5 translate-x-1/3 -translate-y-1/3 bg-primary text-xs text-primary-foreground tabular-nums">
                {threadCount}
              </Badge>
              <span>{getInitials(comment.author)}</span>
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}
