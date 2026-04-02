"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Kbd = styled("kbd", {
  alignItems: "center",
  backgroundColor: "color-mix(in oklab, var(--annotation-primary-foreground) 15%, transparent)",
  borderRadius: "calc(var(--annotation-radius) * 0.6)",
  color: "inherit",
  display: "inline-flex",
  fontSize: "0.75rem",
  fontWeight: 500,
  height: 20,
  justifyContent: "center",
  minWidth: 20,
  padding: "0 0.375rem",
});
