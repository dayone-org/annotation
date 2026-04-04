"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

const inputBase = {
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

export const Input = styled("input", {
  ...inputBase,
  height: 32,
  padding: "0 0.625rem",
  variants: {
    surface: {
      default: {},
      onPrimary: {
        backgroundColor: "color-mix(in oklab, var(--annotation-primary-foreground) 10%, transparent)",
        border: "none",
        color: "var(--annotation-primary-foreground)",
        width: 192,
        "&::placeholder": {
          color: "color-mix(in oklab, var(--annotation-primary-foreground) 50%, transparent)",
        },
        "&:focus": {
          borderColor: "transparent",
          boxShadow:
            "0 0 0 3px color-mix(in oklab, var(--annotation-primary-foreground) 16%, transparent)",
        },
      },
    },
  },
  defaultVariants: {
    surface: "default",
  },
});
