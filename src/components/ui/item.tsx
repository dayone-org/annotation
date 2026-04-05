import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn(
        "annotation:group/item-group annotation:flex annotation:w-full annotation:flex-col annotation:gap-4 annotation:has-data-[size=sm]:gap-2.5 annotation:has-data-[size=xs]:gap-2",
        className,
      )}
      {...props}
    />
  );
}

function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      className={cn("annotation:my-2", className)}
      {...props}
    />
  );
}

const itemVariants = cva(
  "annotation:group/item annotation:flex annotation:w-full annotation:flex-wrap annotation:items-center annotation:rounded-lg annotation:border annotation:text-sm annotation:transition-colors annotation:duration-100 annotation:outline-none annotation:[a]:transition-colors annotation:[a]:hover:bg-muted",
  {
    variants: {
      variant: {
        default: "annotation:border-transparent",
        outline: "annotation:border-border",
        muted: "annotation:border-transparent annotation:bg-muted/50",
      },
      size: {
        default: "annotation:gap-2.5 annotation:px-3 annotation:py-2.5",
        sm: "annotation:gap-2.5 annotation:px-3 annotation:py-2.5",
        xs: "annotation:gap-2 annotation:px-2.5 annotation:py-2 annotation:in-data-[slot=dropdown-menu-content]:p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Item({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={cn(itemVariants({ variant, size, className }))}
      {...props}
    />
  );
}

const itemMediaVariants = cva(
  "annotation:flex annotation:shrink-0 annotation:items-center annotation:justify-center annotation:gap-2 annotation:group-has-data-[slot=item-description]/item:translate-y-0.5 annotation:group-has-data-[slot=item-description]/item:self-start annotation:[&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "annotation:bg-transparent",
        icon: "annotation:[&_svg:not([class*='size-'])]:size-4",
        image:
          "annotation:size-10 annotation:overflow-hidden annotation:rounded-sm annotation:group-data-[size=sm]/item:size-8 annotation:group-data-[size=xs]/item:size-6 annotation:[&_img]:size-full annotation:[&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function ItemMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      className={cn(
        "annotation:flex annotation:flex-1 annotation:flex-col annotation:gap-1 annotation:group-data-[size=xs]/item:gap-0 annotation:[&+[data-slot=item-content]]:flex-none",
        className,
      )}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        "annotation:line-clamp-1 annotation:flex annotation:w-fit annotation:items-center annotation:gap-2 annotation:text-sm annotation:leading-snug annotation:font-medium annotation:underline-offset-4",
        className,
      )}
      {...props}
    />
  );
}

function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        "annotation:line-clamp-2 annotation:text-left annotation:text-sm annotation:leading-normal annotation:font-normal annotation:text-muted-foreground annotation:group-data-[size=xs]/item:text-xs annotation:[&>a]:underline annotation:[&>a]:underline-offset-4 annotation:[&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn("annotation:flex annotation:items-center annotation:gap-2", className)}
      {...props}
    />
  );
}

function ItemHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-header"
      className={cn(
        "annotation:flex annotation:basis-full annotation:items-center annotation:justify-between annotation:gap-2",
        className,
      )}
      {...props}
    />
  );
}

function ItemFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-footer"
      className={cn(
        "annotation:flex annotation:basis-full annotation:items-center annotation:justify-between annotation:gap-2",
        className,
      )}
      {...props}
    />
  );
}

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
};
