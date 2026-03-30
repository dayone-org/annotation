"use client";

import { useInsertionEffect } from "react";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { ensureAnnotationStyles } from "./install-styles";
import type { AnnotationProps } from "./types";

export function Annotation({ ...props }: AnnotationProps) {
  useInsertionEffect(() => {
    ensureAnnotationStyles();
  }, []);

  return <AnnotationOverlay {...props} />;
}
