import { forwardRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { AnnotationRect } from "../types";

const annotationHighlightClassName =
  "pointer-events-none absolute top-0 left-0 rounded-md border-2 border-primary bg-primary/10 will-change-transform";

function getAnnotationHighlightStyle(rect: AnnotationRect): CSSProperties {
  return {
    width: rect.width,
    height: rect.height,
    transform: `translate3d(${rect.pageX}px, ${rect.pageY}px, 0)`,
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
        className={cn(annotationHighlightClassName, className)}
        data-annotation-overlay-root="true"
        ref={ref}
        style={rect ? getAnnotationHighlightStyle(rect) : undefined}
      />
    );
  },
);

AnnotationHighlight.displayName = "AnnotationHighlight";

export { getAnnotationHighlightStyle };
