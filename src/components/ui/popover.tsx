"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";
import { annotationScopeClass, cx, styled } from "@/lib/annotation-overlay/stitches";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

const StyledPopoverContent = styled(PopoverPrimitive.Content, {
  backgroundColor: "var(--annotation-popover)",
  border: "1px solid var(--annotation-border)",
  borderRadius: "calc(var(--annotation-radius) * 1.8)",
  boxShadow: "0 18px 40px color-mix(in oklab, var(--annotation-foreground) 12%, transparent)",
  color: "var(--annotation-popover-foreground)",
  outline: "none",
  zIndex: 2147483603,
});

export function PopoverContent({
  align = "center",
  children,
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <StyledPopoverContent
        align={align}
        className={cx(annotationScopeClass(), className)}
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </StyledPopoverContent>
    </PopoverPrimitive.Portal>
  );
}

export const PopoverHeader = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
});

export const PopoverTitle = styled("h2", {
  fontSize: "0.875rem",
  fontWeight: 600,
  margin: 0,
});
