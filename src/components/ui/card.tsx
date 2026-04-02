"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Card = styled("section", {
  backgroundColor: "var(--annotation-card)",
  border: "1px solid var(--annotation-border)",
  borderRadius: "calc(var(--annotation-radius) * 1.4)",
  boxShadow: "0 12px 30px color-mix(in oklab, var(--annotation-foreground) 10%, transparent)",
  color: "var(--annotation-card-foreground)",
  overflow: "hidden",
});

export const CardHeader = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "1rem",
});

export const CardContent = styled("div", {
  padding: "1rem",
});

export const CardTitle = styled("h2", {
  fontSize: "1rem",
  fontWeight: 600,
  lineHeight: 1.2,
  margin: 0,
});
