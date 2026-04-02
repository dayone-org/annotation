"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Item = styled("button", {
  appearance: "none",
  backgroundColor: "var(--annotation-background)",
  border: "1px solid var(--annotation-border)",
  borderRadius: "calc(var(--annotation-radius) * 1.2)",
  color: "inherit",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.75rem",
  textAlign: "left",
  transition: "border-color 150ms ease, opacity 150ms ease, background-color 150ms ease",
  width: "100%",
  "&:hover": {
    backgroundColor: "var(--annotation-muted)",
  },
});

export const ItemHeader = styled("div", {
  alignItems: "center",
  display: "flex",
  gap: "0.5rem",
  justifyContent: "space-between",
});

export const ItemContent = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
});
