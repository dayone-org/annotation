"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Separator = styled("div", {
  backgroundColor: "var(--annotation-border)",
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
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});
