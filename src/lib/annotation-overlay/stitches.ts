import "@fontsource-variable/geist";
import { createStitches } from "@stitches/react";

type AnnotationColorScale = {
  accent: string;
  accentForeground: string;
  background: string;
  border: string;
  card: string;
  cardForeground: string;
  destructive: string;
  foreground: string;
  input: string;
  muted: string;
  mutedForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  ring: string;
  secondary: string;
  secondaryForeground: string;
};

export const annotationPalette: AnnotationColorScale = {
  accent: "oklch(0.97 0 0)",
  accentForeground: "oklch(0.205 0 0)",
  background: "oklch(1 0 0)",
  border: "oklch(0.922 0 0)",
  card: "oklch(1 0 0)",
  cardForeground: "oklch(0.145 0 0)",
  destructive: "oklch(0.577 0.245 27.325)",
  foreground: "oklch(0.145 0 0)",
  input: "oklch(0.922 0 0)",
  muted: "oklch(0.97 0 0)",
  mutedForeground: "oklch(0.556 0 0)",
  popover: "oklch(1 0 0)",
  popoverForeground: "oklch(0.145 0 0)",
  primary: "oklch(0.852 0.199 91.936)",
  primaryForeground: "oklch(0.421 0.095 57.708)",
  ring: "oklch(0.708 0 0)",
  secondary: "oklch(0.967 0.001 286.375)",
  secondaryForeground: "oklch(0.21 0.006 285.885)",
};

export const annotationTokens = {
  overlayScrim: "color-mix(in oklab, var(--annotation-foreground) 8%, transparent)",
  radius: "0.25rem",
} as const;

export const { css, keyframes, styled } = createStitches({
  prefix: "annotation",
});

export function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function createAnnotationColorVariables(
  colors: AnnotationColorScale,
): Record<string, string> {
  return {
    "--annotation-accent": colors.accent,
    "--annotation-accent-foreground": colors.accentForeground,
    "--annotation-background": colors.background,
    "--annotation-border": colors.border,
    "--annotation-card": colors.card,
    "--annotation-card-foreground": colors.cardForeground,
    "--annotation-destructive": colors.destructive,
    "--annotation-foreground": colors.foreground,
    "--annotation-input": colors.input,
    "--annotation-muted": colors.muted,
    "--annotation-muted-foreground": colors.mutedForeground,
    "--annotation-popover": colors.popover,
    "--annotation-popover-foreground": colors.popoverForeground,
    "--annotation-primary": colors.primary,
    "--annotation-primary-foreground": colors.primaryForeground,
    "--annotation-ring": colors.ring,
    "--annotation-secondary": colors.secondary,
    "--annotation-secondary-foreground": colors.secondaryForeground,
  };
}

export const annotationScopeClass = css({
  ...createAnnotationColorVariables(annotationPalette),
  "--annotation-overlay-scrim": annotationTokens.overlayScrim,
  "--annotation-radius": annotationTokens.radius,
  color: "var(--annotation-foreground)",
  fontFamily: '"Geist Variable", sans-serif',
  lineHeight: 1.5,
  "&, & *": {
    boxSizing: "border-box",
  },
  "& button, & input, & textarea": {
    font: "inherit",
  },
  "& button:not(:disabled), & [role='button']:not(:disabled)": {
    cursor: "pointer",
  },
});

export const annotationPortalLayerClass = css({
  height: 1,
  left: 0,
  position: "absolute",
  top: 0,
  width: 1,
  zIndex: 2147483600,
});
