"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const ScrollArea = styled("div", {
  overflow: "auto",
  scrollbarColor:
    "color-mix(in oklab, var(--annotation-foreground) 18%, transparent) transparent",
  scrollbarWidth: "thin",
});
