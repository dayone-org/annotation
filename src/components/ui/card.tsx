import * as React from "react";
import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "annotation:group/card annotation:flex annotation:flex-col annotation:gap-4 annotation:overflow-hidden annotation:rounded-md annotation:bg-card annotation:py-4 annotation:text-sm annotation:text-card-foreground annotation:ring-1 annotation:ring-foreground/10 annotation:has-data-[slot=card-footer]:pb-0 annotation:has-[>img:first-child]:pt-0 annotation:data-[size=sm]:gap-3 annotation:data-[size=sm]:py-3 annotation:data-[size=sm]:has-data-[slot=card-footer]:pb-0 annotation:*:[img:first-child]:rounded-t-xl annotation:*:[img:last-child]:rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "annotation:group/card-header annotation:@container/card-header annotation:grid annotation:auto-rows-min annotation:items-start annotation:gap-1 annotation:rounded-t-xl annotation:px-4 annotation:group-data-[size=sm]/card:px-3 annotation:has-data-[slot=card-action]:grid-cols-[1fr_auto] annotation:has-data-[slot=card-description]:grid-rows-[auto_auto] annotation:[.border-b]:pb-4 annotation:group-data-[size=sm]/card:[.border-b]:pb-3",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "annotation:text-base annotation:leading-snug annotation:font-medium annotation:group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("annotation:text-sm annotation:text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "annotation:col-start-2 annotation:row-span-2 annotation:row-start-1 annotation:self-start annotation:justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("annotation:px-4 annotation:group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "annotation:flex annotation:items-center annotation:rounded-b-xl annotation:border-t annotation:bg-muted/50 annotation:p-4 annotation:group-data-[size=sm]/card:p-3",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
