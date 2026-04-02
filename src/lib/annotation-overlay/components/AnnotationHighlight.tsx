import { forwardRef, type CSSProperties } from "react";
import { css, cx } from "../stitches";
import type { AnnotationRect } from "../types";

const annotationHighlightClass = css({
  backgroundColor: "color-mix(in oklab, var(--annotation-primary) 10%, transparent)",
  border: "2px solid var(--annotation-primary)",
  borderRadius: "calc(var(--annotation-radius) * 1.2)",
  left: 0,
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  willChange: "transform",
});

function getAnnotationHighlightStyle(rect: AnnotationRect): CSSProperties {
  return {
    height: rect.height,
    transform: `translate3d(${rect.pageX}px, ${rect.pageY}px, 0)`,
    width: rect.width,
  };
}

type AnnotationHighlightProps = {
  className?: string;
  rect?: AnnotationRect;
};

export const AnnotationHighlight = forwardRef<HTMLDivElement, AnnotationHighlightProps>(
  ({ className, rect }, ref) => {
    return (
      <div
        aria-hidden="true"
        className={cx(annotationHighlightClass(), className)}
        data-annotation-overlay-root="true"
        ref={ref}
        style={rect ? getAnnotationHighlightStyle(rect) : undefined}
      />
    );
  },
);

AnnotationHighlight.displayName = "AnnotationHighlight";

export { getAnnotationHighlightStyle };
