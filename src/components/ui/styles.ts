import { css } from "@/lib/annotation-overlay/stitches";

export const srOnlyClass = css({
  border: 0,
  clip: "rect(0, 0, 0, 0)",
  clipPath: "inset(50%)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
});

export const errorMessageClass = css({
  backgroundColor: "color-mix(in oklab, var(--annotation-destructive) 10%, transparent)",
  border: "1px solid color-mix(in oklab, var(--annotation-destructive) 30%, transparent)",
  borderRadius: "calc(var(--annotation-radius) * 1.2)",
  color: "var(--annotation-destructive)",
  fontSize: "0.875rem",
  padding: "0.625rem 0.75rem",
});

export const subtleTextClass = css({
  color: "var(--annotation-muted-foreground)",
});

export const headingTextClass = css({
  color: "var(--annotation-foreground)",
  fontWeight: 600,
});
