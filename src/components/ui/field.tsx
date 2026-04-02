"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const FieldGroup = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
});

export const Field = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  variants: {
    orientation: {
      horizontal: {
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
      },
      vertical: {},
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

export const FieldLabel = styled("label", {
  color: "var(--annotation-foreground)",
  fontSize: "0.875rem",
  fontWeight: 500,
  lineHeight: 1.2,
});
