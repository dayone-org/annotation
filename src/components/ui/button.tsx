"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Button = styled("button", {
  alignItems: "center",
  appearance: "none",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "calc(var(--annotation-radius) * 0.8)",
  color: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  flexShrink: 0,
  fontFamily: "inherit",
  fontSize: "0.875rem",
  fontWeight: 500,
  gap: "0.375rem",
  justifyContent: "center",
  outline: "none",
  padding: "0 0.625rem",
  position: "relative",
  transition:
    "background-color 150ms ease, border-color 150ms ease, color 150ms ease, opacity 150ms ease, filter 150ms ease, transform 150ms ease",
  userSelect: "none",
  whiteSpace: "nowrap",
  "&:disabled": {
    cursor: "default",
    opacity: 0.5,
    pointerEvents: "none",
  },
  "&:focus-visible": {
    boxShadow: "0 0 0 3px color-mix(in oklab, var(--annotation-ring) 35%, transparent)",
  },
  "& svg": {
    flexShrink: 0,
    pointerEvents: "none",
  },
  variants: {
    size: {
      default: {
        height: 32,
        minWidth: 32,
        padding: "0 0.625rem",
      },
      xs: {
        borderRadius: "min(calc(var(--annotation-radius) * 0.8), 10px)",
        fontSize: "0.75rem",
        height: 24,
        minWidth: 24,
        padding: "0 0.5rem",
      },
      sm: {
        borderRadius: "min(calc(var(--annotation-radius) * 0.8), 12px)",
        fontSize: "0.8rem",
        height: 28,
        minWidth: 28,
        padding: "0 0.625rem",
      },
      icon: {
        height: 32,
        padding: 0,
        width: 32,
      },
      iconSm: {
        borderRadius: "min(calc(var(--annotation-radius) * 0.8), 12px)",
        height: 28,
        padding: 0,
        width: 28,
      },
    },
    variant: {
      default: {
        backgroundColor: "var(--annotation-primary)",
        color: "var(--annotation-primary-foreground)",
        "&:hover:not(:disabled)": {
          filter: "brightness(0.95)",
        },
      },
      destructive: {
        backgroundColor: "color-mix(in oklab, var(--annotation-destructive) 10%, transparent)",
        color: "var(--annotation-destructive)",
        "&:hover:not(:disabled)": {
          backgroundColor: "color-mix(in oklab, var(--annotation-destructive) 18%, transparent)",
        },
      },
      ghost: {
        color: "var(--annotation-foreground)",
        "&:hover:not(:disabled)": {
          backgroundColor: "var(--annotation-muted)",
        },
      },
      ghostOnPrimary: {
        backgroundColor: "transparent",
        color: "var(--annotation-primary-foreground)",
        "&:hover:not(:disabled)": {
          backgroundColor: "color-mix(in oklab, var(--annotation-primary-foreground) 14%, transparent)",
        },
      },
      outline: {
        backgroundColor: "var(--annotation-background)",
        borderColor: "var(--annotation-border)",
        color: "var(--annotation-foreground)",
        "&:hover:not(:disabled)": {
          backgroundColor: "var(--annotation-muted)",
        },
      },
      secondary: {
        backgroundColor: "var(--annotation-secondary)",
        color: "var(--annotation-secondary-foreground)",
        "&:hover:not(:disabled)": {
          filter: "brightness(0.98)",
        },
      },
    },
  },
  defaultVariants: {
    size: "default",
    variant: "default",
  },
});
