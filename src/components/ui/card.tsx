"use client";

import { styled } from "@/lib/annotation-overlay/stitches";

export const Card = styled("section", {
  backgroundColor: "var(--annotation-card)",
  border: "1px solid var(--annotation-border)",
  borderRadius: "calc(var(--annotation-radius) * 1.4)",
  boxShadow: "0 12px 30px color-mix(in oklab, var(--annotation-foreground) 10%, transparent)",
  color: "var(--annotation-card-foreground)",
  overflow: "hidden",
  variants: {
    layout: {
      default: {},
      panel: {
        paddingBottom: 0,
        width: 256,
      },
      settings: {
        width: 256,
      },
    },
  },
  defaultVariants: {
    layout: "default",
  },
});

export const CardHeader = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "1rem",
});

export const CardContent = styled("div", {
  padding: "1rem",
  variants: {
    flush: {
      true: {
        borderTop: "1px solid var(--annotation-border)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: 0,
      },
    },
  },
  defaultVariants: {
    flush: false,
  },
});

export const CardTitle = styled("h2", {
  fontSize: "1rem",
  fontWeight: 600,
  lineHeight: 1.2,
  margin: 0,
  variants: {
    layout: {
      default: {},
      settings: {
        alignItems: "baseline",
        display: "flex",
        gap: "0.5rem",
        justifyContent: "space-between",
      },
    },
  },
  defaultVariants: {
    layout: "default",
  },
});
