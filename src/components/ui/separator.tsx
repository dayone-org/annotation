"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Separator = styled("div", {
  flexShrink: 0,
  variants: {
    orientation: {
      horizontal: {
        height: 1,
        width: "100%",
      },
      vertical: {
        height: 20,
        width: 1,
      },
    },
    tone: {
      default: {
        backgroundColor: "var(--annotation-border)",
      },
      onPrimary: {
        backgroundColor: "color-mix(in oklab, var(--annotation-primary-foreground) 25%, transparent)",
      },
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    tone: "default",
  },
});
