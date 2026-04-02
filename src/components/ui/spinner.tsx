"use client";

import { keyframes, styled } from "@/lib/annotation-overlay/stitches";

const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
});

export const Spinner = styled("span", {
  animation: `${spin} 0.8s linear infinite`,
  border: "2px solid color-mix(in oklab, var(--annotation-foreground) 15%, transparent)",
  borderRadius: 9999,
  borderTopColor: "currentColor",
  display: "inline-block",
  height: 16,
  width: 16,
});
