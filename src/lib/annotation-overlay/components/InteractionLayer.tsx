import { useEffect, useState } from "react";
import type { AnnotationRect } from "../types";
import { generateSelector, querySelectorSafely } from "../selector";
import { useAnnotation } from "../useAnnotation";
import { measurePoint, measureRect } from "../utils";

function getSelectableElement(target: EventTarget | null): HTMLElement | null {
  const node =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  if (!node || node.closest('[data-annotation-overlay-root="true"]')) {
    return null;
  }

  if (node === document.body || node === document.documentElement) {
    return null;
  }

  return node;
}

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

export function InteractionLayer() {
  const { commentMode, composer, selectElement } = useAnnotation();
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [highlightRect, setHighlightRect] = useState<AnnotationRect | null>(null);

  const selectedElement = composer?.selector ? querySelectorSafely(composer.selector) : null;
  const highlightedElement = selectedElement ?? (commentMode ? hoveredElement : null);

  useEffect(() => {
    if (!commentMode) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const target = getSelectableElement(event.target);
      setHoveredElement((previous) => (previous === target ? previous : target));
    };

    const handleClick = (event: MouseEvent) => {
      const target = getSelectableElement(event.target);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setHoveredElement(target);
      selectElement(generateSelector(target), measurePoint(event.clientX, event.clientY, target));
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [commentMode, selectElement]);

  useEffect(() => {
    if (!highlightedElement) {
      return;
    }

    let frameId = 0;

    const syncHighlight = () => {
      if (!highlightedElement.isConnected) {
        setHighlightRect(null);
        return;
      }

      const nextRect = measureRect(highlightedElement);
      setHighlightRect((previous) => (rectsEqual(previous, nextRect) ? previous : nextRect));
      frameId = window.requestAnimationFrame(syncHighlight);
    };

    syncHighlight();

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [highlightedElement]);

  if (!highlightedElement || !highlightRect) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed rounded-md border-2 border-primary bg-primary/10"
      data-annotation-overlay-root="true"
      style={{
        height: highlightRect.height,
        left: highlightRect.left,
        top: highlightRect.top,
        width: highlightRect.width,
      }}
    />
  );
}
