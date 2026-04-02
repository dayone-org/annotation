import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { css } from "../stitches";
import type { AnnotationRect } from "../types";
import { generateSelector, getSelectableElementAtPoint, querySelectorSafely } from "../selector";
import { useAnnotation } from "../useAnnotation";
import { measurePoint, measureRect } from "../utils";
import { AnnotationHighlight, getAnnotationHighlightStyle } from "./AnnotationHighlight";

const interactionLayerClass = css({
  cursor: "crosshair",
  inset: 0,
  position: "fixed",
  zIndex: 2147483601,
});

const highlightOverlayClass = css({
  zIndex: 2147483601,
});

function rectsEqual(left: AnnotationRect | null, right: AnnotationRect): boolean {
  if (!left) {
    return false;
  }

  return (
    left.pageX === right.pageX &&
    left.pageY === right.pageY &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function InteractionLayer() {
  const { annotationMode, composer, isMarkerHovered, selectElement } = useAnnotation();
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const isInteractionActive = annotationMode && !composer;
  const highlightNodeRef = useRef<HTMLDivElement | null>(null);
  const highlightRectRef = useRef<AnnotationRect | null>(null);

  const selectedElement = composer?.selector ? querySelectorSafely(composer.selector) : null;
  const highlightedElement = isMarkerHovered
    ? null
    : (selectedElement ?? (annotationMode ? hoveredElement : null));

  const applyHighlightRect = useCallback((node: HTMLDivElement, rect: AnnotationRect) => {
    node.style.height = `${rect.height}px`;
    node.style.transform = `${getAnnotationHighlightStyle(rect).transform}`;
    node.style.width = `${rect.width}px`;
  }, []);

  const setHighlightNode = useCallback(
    (node: HTMLDivElement | null) => {
      highlightNodeRef.current = node;

      if (!node || !highlightRectRef.current) {
        return;
      }

      applyHighlightRect(node, highlightRectRef.current);
    },
    [applyHighlightRect],
  );

  const updateHoveredElement = useCallback((clientX: number, clientY: number) => {
    const target = getSelectableElementAtPoint(clientX, clientY);
    setHoveredElement((previous) => (previous === target ? previous : target));
    return target;
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      updateHoveredElement(event.clientX, event.clientY);
    },
    [updateHoveredElement],
  );

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = updateHoveredElement(event.clientX, event.clientY);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      selectElement(generateSelector(target), measurePoint(event.clientX, event.clientY, target));
    },
    [selectElement, updateHoveredElement],
  );

  useEffect(() => {
    if (isInteractionActive) {
      return;
    }

    setHoveredElement(null);
  }, [isInteractionActive]);

  useEffect(() => {
    if (!highlightedElement) {
      highlightRectRef.current = null;
      return;
    }

    let frameId = 0;

    const syncHighlight = () => {
      if (!highlightedElement.isConnected) {
        highlightRectRef.current = null;
        return;
      }

      const nextRect = measureRect(highlightedElement);
      if (!rectsEqual(highlightRectRef.current, nextRect)) {
        highlightRectRef.current = nextRect;

        if (highlightNodeRef.current) {
          applyHighlightRect(highlightNodeRef.current, nextRect);
        }
      }

      frameId = window.requestAnimationFrame(syncHighlight);
    };

    syncHighlight();

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [applyHighlightRect, highlightedElement]);

  if (!isInteractionActive && !highlightedElement) {
    return null;
  }

  return (
    <>
      {isInteractionActive ? (
        <div
          aria-hidden="true"
          className={interactionLayerClass()}
          data-annotation-overlay-root="true"
          onClick={handleClick}
          onPointerMove={handlePointerMove}
        />
      ) : null}

      {highlightedElement ? (
        <AnnotationHighlight className={highlightOverlayClass()} ref={setHighlightNode} />
      ) : null}
    </>
  );
}
