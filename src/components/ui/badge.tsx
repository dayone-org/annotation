"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Badge = styled("span", {
  alignItems: "center",
  border: "1px solid transparent",
  borderRadius: 9999,
  display: "inline-flex",
  fontSize: "0.75rem",
  fontWeight: 500,
  height: 20,
  justifyContent: "center",
  lineHeight: 1,
  minWidth: 20,
  padding: "0 0.5rem",
  variants: {
    variant: {
      default: {
        backgroundColor: "var(--annotation-primary)",
        color: "var(--annotation-primary-foreground)",
      },
      secondary: {
        backgroundColor: "var(--annotation-secondary)",
        color: "var(--annotation-secondary-foreground)",
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
