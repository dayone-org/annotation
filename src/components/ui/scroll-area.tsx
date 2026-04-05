"use client";

import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("annotation:relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="annotation:size-full annotation:rounded-[inherit] annotation:transition-[color,box-shadow] annotation:outline-none"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "annotation:flex annotation:touch-none annotation:p-px annotation:transition-colors annotation:select-none annotation:data-[orientation=horizontal]:h-2.5 annotation:data-[orientation=horizontal]:flex-col annotation:data-[orientation=horizontal]:border-t annotation:data-[orientation=horizontal]:border-t-transparent annotation:data-[orientation=vertical]:h-full annotation:data-[orientation=vertical]:w-2.5 annotation:data-[orientation=vertical]:border-l annotation:data-[orientation=vertical]:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="annotation:relative annotation:flex-1 annotation:rounded-full annotation:bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
