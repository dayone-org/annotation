"use client";

import type { AnnotationProps } from "./types";
import { AnnotationOverlay } from "./AnnotationOverlay";

export function Annotation({ ...props }: AnnotationProps) {
  return <AnnotationOverlay {...props} />;
}
