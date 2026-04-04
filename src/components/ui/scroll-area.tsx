"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const ScrollArea = styled("div", {
  overflow: "auto",
  scrollbarColor:
    "color-mix(in oklab, var(--annotation-foreground) 18%, transparent) transparent",
  scrollbarWidth: "thin",
  variants: {
    heightMode: {
      default: {},
      panel: {
        height: "100%",
        maxHeight: "min(24rem, calc(100vh - 8rem))",
      },
      composer: {
        maxHeight: "min(18rem, 40vh)",
      },
    },
  },
  defaultVariants: {
    heightMode: "default",
  },
});
