"use client";

import { XIcon } from "@phosphor-icons/react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "annotation:fixed annotation:inset-0 annotation:z-50 annotation:bg-black/10 annotation:transition-opacity annotation:duration-100 annotation:data-[state=closed]:opacity-0 annotation:data-[state=open]:opacity-100 annotation:supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "annotation:fixed annotation:z-2147483603 annotation:flex annotation:flex-col annotation:gap-4 annotation:bg-background annotation:bg-clip-padding annotation:text-sm annotation:shadow-lg annotation:transition-[opacity,transform] annotation:duration-200 annotation:ease-in-out annotation:data-[state=closed]:opacity-0 annotation:data-[state=open]:opacity-100 annotation:data-[side=bottom]:inset-x-0 annotation:data-[side=bottom]:bottom-0 annotation:data-[side=bottom]:h-auto annotation:data-[side=bottom]:border-t annotation:data-[side=bottom]:data-[state=closed]:translate-y-10 annotation:data-[side=bottom]:data-[state=open]:translate-y-0 annotation:data-[side=left]:inset-y-0 annotation:data-[side=left]:left-0 annotation:data-[side=left]:h-full annotation:data-[side=left]:w-3/4 annotation:data-[side=left]:border-r annotation:data-[side=left]:data-[state=closed]:-translate-x-10 annotation:data-[side=left]:data-[state=open]:translate-x-0 annotation:data-[side=right]:inset-y-0 annotation:data-[side=right]:right-0 annotation:data-[side=right]:h-full annotation:data-[side=right]:w-3/4 annotation:data-[side=right]:border-l annotation:data-[side=right]:data-[state=closed]:translate-x-10 annotation:data-[side=right]:data-[state=open]:translate-x-0 annotation:data-[side=top]:inset-x-0 annotation:data-[side=top]:top-0 annotation:data-[side=top]:h-auto annotation:data-[side=top]:border-b annotation:data-[side=top]:data-[state=closed]:-translate-y-10 annotation:data-[side=top]:data-[state=open]:translate-y-0 annotation:data-[side=left]:sm:max-w-sm annotation:data-[side=right]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="annotation:absolute annotation:top-3 annotation:right-3"
              size="icon-sm"
            >
              <XIcon />
              <span className="annotation:sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "annotation:flex annotation:flex-col annotation:gap-0.5 annotation:p-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "annotation:mt-auto annotation:flex annotation:flex-col annotation:gap-2 annotation:p-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "annotation:text-base annotation:font-medium annotation:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("annotation:text-sm annotation:text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
