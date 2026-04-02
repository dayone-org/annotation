"use client";

import { AnnotationOverlay } from "./AnnotationOverlay";
import type { AnnotationProps } from "./types";

export function Annotation({ ...props }: AnnotationProps) {
  return <AnnotationOverlay {...props} />;
}
