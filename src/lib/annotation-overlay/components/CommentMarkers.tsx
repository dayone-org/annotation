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
import { css, cx } from "../stitches";
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

const markersLayerClass = css({
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
  zIndex: 2147483602,
});

const markerButtonClass = css({
  appearance: "none",
  background: "transparent",
  border: 0,
  cursor: "grab",
  height: MARKER_SIZE,
  left: 0,
  padding: 0,
  pointerEvents: "auto",
  position: "absolute",
  top: 0,
  touchAction: "none",
  userSelect: "none",
  width: MARKER_SIZE,
  "&:active": {
    cursor: "grabbing",
  },
  "&:focus-visible": {
    outline: "none",
  },
});

const markerResolvedClass = css({
  opacity: 0.35,
});

const markerBubbleClass = css({
  alignItems: "center",
  backgroundColor: "var(--annotation-primary)",
  borderRadius: "9999px",
  boxShadow: "0 18px 30px color-mix(in oklab, var(--annotation-foreground) 18%, transparent)",
  color: "var(--annotation-primary-foreground)",
  display: "flex",
  fontSize: "0.75rem",
  fontWeight: 600,
  height: "100%",
  inset: 0,
  justifyContent: "center",
  position: "absolute",
  transition: "opacity 150ms ease, background-color 150ms ease, color 150ms ease",
  width: "100%",
});

const markerCountBadgeClass = css({
  alignItems: "center",
  backgroundColor: "var(--annotation-foreground)",
  borderRadius: "9999px",
  color: "var(--annotation-background)",
  display: "inline-flex",
  fontSize: "0.6875rem",
  fontWeight: 600,
  height: 20,
  justifyContent: "center",
  minWidth: 20,
  padding: "0 0.35rem",
  pointerEvents: "none",
  position: "absolute",
  right: 0,
  top: 0,
  transform: "translate(33%, -33%)",
});

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
      hasMoved: false,
      pointerId: event.pointerId,
      pointerOffsetX: event.clientX - markerRect.left,
      pointerOffsetY: event.clientY - markerRect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      target: querySelectorSafely(comment?.selector ?? null),
      threadId,
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
    <div className={markersLayerClass()} data-annotation-overlay-root="true">
      {dragHighlightRect ? <AnnotationHighlight rect={dragHighlightRect} /> : null}
      <AnimatePresence initial={false} mode="popLayout">
        {annotationMode &&
          topLevelComments.map((comment) => {
            const position = positions[comment.id];
            if (!position) {
              return null;
            }

            const threadCount = getThreadCount(comments, comment.id);

            return (
              <button
                className={cx(markerButtonClass(), comment.resolved && markerResolvedClass())}
                data-thread-id={comment.id}
                key={comment.id}
                onClick={handleMarkerClick}
                onPointerCancel={handlePointerCancel}
                onPointerDown={handlePointerDown}
                onPointerEnter={() => setMarkerHovered(true)}
                onPointerLeave={() => setMarkerHovered(false)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                ref={(node) => setMarkerElement(comment.id, node)}
                style={getMarkerStyle(position)}
                title={`${comment.author} · ${comment.resolved ? "Resolved" : "Open"} · ${threadCount} message${
                  threadCount === 1 ? "" : "s"
                }`}
                type="button"
              >
                <motion.div
                  animate={{
                    opacity: 1,
                    scale: 1,
                    transition: {
                      duration: 0.15,
                      ease: "easeOut",
                    },
                  }}
                  className={cx(markerBubbleClass(), comment.resolved && markerResolvedClass())}
                  exit={{
                    opacity: 0,
                    scale: 0.8,
                    transition: {
                      duration: 0.15,
                      ease: "easeIn",
                    },
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  transition={{ damping: 50, stiffness: 500, type: "spring" }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className={markerCountBadgeClass()}>{threadCount}</span>
                  <span>{getInitials(comment.author)}</span>
                </motion.div>
              </button>
            );
          })}
      </AnimatePresence>
    </div>
  );
}
