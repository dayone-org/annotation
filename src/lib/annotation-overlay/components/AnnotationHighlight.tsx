import { forwardRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { AnnotationRect } from "../types";

const annotationHighlightClassName =
  "annotation:pointer-events-none annotation:absolute annotation:top-0 annotation:left-0 annotation:rounded-md annotation:border-2 annotation:border-primary annotation:bg-primary/10 annotation:will-change-transform";

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
