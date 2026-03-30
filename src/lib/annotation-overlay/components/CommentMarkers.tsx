import { AnimatePresence, motion } from "motion/react";
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
import type { AnnotationComment, AnnotationRect, MarkerPosition } from "../types";
import { generateSelector, getSelectableElementAtPoint, querySelectorSafely } from "../selector";
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
import { AnnotationHighlight } from "./AnnotationHighlight";

const MARKER_SIZE = 32;
const MARKER_OFFSET_X = -(MARKER_SIZE / 2);
const MARKER_OFFSET_Y = -(MARKER_SIZE / 2);
const DRAG_DISTANCE_THRESHOLD = 4;

type DragSession = {
  pointerId: number;
  threadId: string;
  startClientX: number;
  startClientY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  target: HTMLElement | null;
  hasMoved: boolean;
};

type MarkerStyle = CSSProperties & {
  "--marker-base-x": string;
  "--marker-base-y": string;
};

function rectsEqual(left: AnnotationRect | null, right: AnnotationRect): boolean {
  if (!left) {
    return false;
  }

  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height
  );
}

function getMarkerStyle(position: MarkerPosition): MarkerStyle {
  return {
    "--marker-base-x": `${position.x + MARKER_OFFSET_X}px`,
    "--marker-base-y": `${position.y + MARKER_OFFSET_Y}px`,
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

function setMarkerBasePosition(node: HTMLElement, position: MarkerPosition) {
  node.style.setProperty("--marker-base-x", `${position.x + MARKER_OFFSET_X}px`);
  node.style.setProperty("--marker-base-y", `${position.y + MARKER_OFFSET_Y}px`);
}

export function CommentMarkers() {
  const {
    annotationMode,
    comments,
    currentPath,
    openThreadComposer,
    setMarkerHovered,
    showResolved,
    updateThreadRect,
  } = useAnnotation();
  const [positions, setPositions] = useState<Record<string, MarkerPosition>>({});
  const [dragHighlightElement, setDragHighlightElement] = useState<HTMLElement | null>(null);
  const [dragHighlightRect, setDragHighlightRect] = useState<AnnotationRect | null>(null);
  const markerElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const positionsRef = useRef<Record<string, MarkerPosition>>({});
  const topLevelCommentsRef = useRef<AnnotationComment[]>([]);
  const topLevelCommentMapRef = useRef(new Map<string, AnnotationComment>());
  const dragSessionRef = useRef<DragSession | null>(null);
  const ignoreClickThreadIdRef = useRef<string | null>(null);
  const resizeFrameIdRef = useRef(0);

  const topLevelComments = useMemo(() => {
    if (!annotationMode) {
      return [];
    }

    return getTopLevelComments(comments).filter(
      (comment) => comment.page_path === currentPath && (showResolved || !comment.resolved),
    );
  }, [annotationMode, comments, currentPath, showResolved]);

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
        setMarkerBasePosition(markerNode, nextPosition);
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

    setMarkerBasePosition(node, position);
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
        x: event.clientX + window.scrollX - session.pointerOffsetX - MARKER_OFFSET_X,
        y: event.clientY + window.scrollY - session.pointerOffsetY - MARKER_OFFSET_Y,
      };

      if (!markerPositionsEqual(currentPosition, nextPosition)) {
        const nextPositions = {
          ...positionsRef.current,
          [session.threadId]: nextPosition,
        };

        positionsRef.current = nextPositions;
        setPositions(nextPositions);
      }

      setMarkerBasePosition(event.currentTarget, nextPosition);
      clearMarkerDelta(event.currentTarget);
      setDragHighlightElement(null);
      setDragHighlightRect(null);

      const dropTarget =
        getSelectableElementAtPoint(event.clientX, event.clientY) ?? session.target ?? undefined;
      const nextSelector = dropTarget ? generateSelector(dropTarget) : undefined;

      ignoreClickThreadIdRef.current = session.threadId;
      await updateThreadRect(
        session.threadId,
        measurePoint(nextPosition.x - window.scrollX, nextPosition.y - window.scrollY, dropTarget),
        nextSelector,
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
      setDragHighlightElement(null);
      setDragHighlightRect(null);
      setMarkerHovered(false);
      syncMarkerPositions(false);
    },
    [setMarkerHovered, syncMarkerPositions],
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
      const nextTarget = getSelectableElementAtPoint(event.clientX, event.clientY);

      if (nextTarget) {
        session.target = nextTarget;
      }

      setDragHighlightElement(nextTarget);
      setDragHighlightRect(null);
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
      if (!session.hasMoved) {
        setDragHighlightElement(null);
        setDragHighlightRect(null);
      }
      setMarkerHovered(false);
      void finishDrag(event, session);
    },
    [finishDrag, setMarkerHovered],
  );

  useEffect(() => {
    if (!dragHighlightElement) {
      return;
    }

    let frameId = 0;

    const syncHighlight = () => {
      if (!dragHighlightElement.isConnected) {
        setDragHighlightRect(null);
        return;
      }

      const nextRect = measureRect(dragHighlightElement);
      setDragHighlightRect((previous) => (rectsEqual(previous, nextRect) ? previous : nextRect));
      frameId = window.requestAnimationFrame(syncHighlight);
    };

    syncHighlight();

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [dragHighlightElement]);

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
    if (annotationMode) {
      return;
    }

    dragSessionRef.current = null;
    setDragHighlightElement(null);
    setDragHighlightRect(null);
  }, [annotationMode]);

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
      {dragHighlightRect ? <AnnotationHighlight rect={dragHighlightRect} /> : null}
      <AnimatePresence mode="popLayout" initial={false}>
        {annotationMode &&
          topLevelComments.map((comment) => {
            const position = positions[comment.id];
            if (!position) {
              return null;
            }

            const threadCount = getThreadCount(comments, comment.id);

            return (
              <Button
                key={comment.id}
                className={cn(
                  "pointer-events-auto absolute top-0 left-0 inline-flex cursor-grab touch-none rounded-full bg-transparent transition-none select-none active:cursor-grabbing",
                  comment.resolved && "opacity-35",
                )}
                data-thread-id={comment.id}
                onClick={handleMarkerClick}
                onPointerCancel={handlePointerCancel}
                onPointerDown={handlePointerDown}
                onPointerEnter={() => setMarkerHovered(true)}
                onPointerLeave={() => setMarkerHovered(false)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                ref={(node) => setMarkerElement(comment.id, node)}
                size="icon"
                style={getMarkerStyle(position)}
                title={`${comment.author} · ${comment.resolved ? "Resolved" : "Open"} · ${threadCount} message${
                  threadCount === 1 ? "" : "s"
                }`}
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    transition: {
                      duration: 0.15,
                      ease: "easeOut",
                    },
                  }}
                  exit={{
                    scale: 0.8,
                    opacity: 0,
                    transition: {
                      duration: 0.15,
                      ease: "easeIn",
                    },
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 500, damping: 50 }}
                  className={cn(
                    "absolute inset-0 flex items-center justify-center rounded-full text-xs shadow-lg transition-colors",
                    "bg-primary text-primary-foreground",
                    comment.resolved && "opacity-35",
                  )}
                >
                  <Badge className="pointer-events-none absolute top-0 right-0 size-5 translate-x-1/3 -translate-y-1/3 bg-foreground text-xs text-background">
                    {threadCount}
                  </Badge>
                  <span>{getInitials(comment.author)}</span>
                </motion.div>
              </Button>
            );
          })}
      </AnimatePresence>
    </div>
  );
}
