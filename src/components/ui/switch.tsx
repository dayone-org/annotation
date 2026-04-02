"use client";

import { css } from "@/lib/annotation-overlay/stitches";

const switchThumbClass = css({
  backgroundColor: "var(--annotation-card)",
  borderRadius: 9999,
  boxShadow: "0 1px 3px color-mix(in oklab, var(--annotation-foreground) 12%, transparent)",
  display: "block",
  height: 18,
  transition: "transform 150ms ease, background-color 150ms ease",
  width: 18,
});

type SwitchProps = {
  checked: boolean;
  id?: string;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({ checked, id, onCheckedChange }: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      id={id}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      style={{
        alignItems: "center",
        backgroundColor: checked ? "var(--annotation-primary)" : "var(--annotation-input)",
        border: "1px solid transparent",
        borderRadius: 9999,
        display: "inline-flex",
        height: 24,
        justifyContent: checked ? "flex-end" : "flex-start",
        padding: 2,
        transition: "background-color 150ms ease",
        width: 40,
      }}
      type="button"
    >
      <span className={switchThumbClass()} style={{ transform: "translateX(0)" }} />
    </button>
  );
}
