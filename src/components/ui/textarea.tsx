"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

const textareaBase = {
  appearance: "none" as const,
  backgroundColor: "transparent",
  border: "1px solid var(--annotation-input)",
  borderRadius: "calc(var(--annotation-radius) * 0.8)",
  color: "var(--annotation-foreground)",
  fontFamily: "inherit",
  fontSize: "0.875rem",
  lineHeight: 1.4,
  outline: "none",
  transition: "border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease",
  width: "100%",
  "&::placeholder": {
    color: "var(--annotation-muted-foreground)",
  },
  "&:focus": {
    borderColor: "var(--annotation-ring)",
    boxShadow: "0 0 0 3px color-mix(in oklab, var(--annotation-ring) 28%, transparent)",
  },
};

export const Textarea = styled("textarea", {
  ...textareaBase,
  minHeight: 72,
  padding: "0.625rem",
  resize: "vertical",
});
