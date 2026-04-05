import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "annotation:group/button annotation:inline-flex annotation:shrink-0 annotation:items-center annotation:justify-center annotation:rounded-lg annotation:border annotation:border-transparent annotation:bg-clip-padding annotation:text-sm annotation:font-medium annotation:whitespace-nowrap annotation:transition-all annotation:outline-none annotation:select-none annotation:disabled:pointer-events-none annotation:disabled:opacity-50 annotation:aria-invalid:border-destructive annotation:aria-invalid:ring-3 annotation:aria-invalid:ring-destructive/20 annotation:dark:aria-invalid:border-destructive/50 annotation:dark:aria-invalid:ring-destructive/40 annotation:[&_svg]:pointer-events-none annotation:[&_svg]:shrink-0 annotation:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "annotation:bg-primary annotation:text-primary-foreground annotation:[a]:hover:bg-primary/80 annotation:hover:brightness-90 annotation:aria-expanded:brightness-90",
        outline:
          "annotation:border-border annotation:bg-background annotation:hover:bg-muted annotation:hover:text-foreground annotation:aria-expanded:bg-muted annotation:aria-expanded:text-foreground annotation:dark:border-input annotation:dark:bg-input/30 annotation:dark:hover:bg-input/50",
        secondary:
          "annotation:bg-secondary annotation:text-secondary-foreground annotation:hover:bg-secondary/80 annotation:aria-expanded:bg-secondary annotation:aria-expanded:text-secondary-foreground",
        ghost:
          "annotation:hover:bg-muted annotation:hover:text-foreground annotation:aria-expanded:bg-muted annotation:aria-expanded:text-foreground annotation:dark:hover:bg-muted/50",
        destructive:
          "annotation:bg-destructive/10 annotation:text-destructive annotation:hover:bg-destructive/20 annotation:dark:bg-destructive/20 annotation:dark:hover:bg-destructive/30",
        link: "annotation:text-primary annotation:underline-offset-4 annotation:hover:underline",
      },
      size: {
        default:
          "annotation:h-8 annotation:gap-1.5 annotation:px-2.5 annotation:has-data-[icon=inline-end]:pr-2 annotation:has-data-[icon=inline-start]:pl-2",
        xs: "annotation:h-6 annotation:gap-1 annotation:rounded-[min(var(--radius-md),10px)] annotation:px-2 annotation:text-xs annotation:in-data-[slot=button-group]:rounded-lg annotation:has-data-[icon=inline-end]:pr-1.5 annotation:has-data-[icon=inline-start]:pl-1.5 annotation:[&_svg:not([class*='size-'])]:size-3",
        sm: "annotation:h-7 annotation:gap-1 annotation:rounded-[min(var(--radius-md),12px)] annotation:px-2.5 annotation:text-[0.8rem] annotation:in-data-[slot=button-group]:rounded-lg annotation:has-data-[icon=inline-end]:pr-1.5 annotation:has-data-[icon=inline-start]:pl-1.5 annotation:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "annotation:h-9 annotation:gap-1.5 annotation:px-2.5 annotation:has-data-[icon=inline-end]:pr-3 annotation:has-data-[icon=inline-start]:pl-3",
        icon: "annotation:size-8",
        "icon-xs":
          "annotation:size-6 annotation:rounded-[min(var(--radius-md),10px)] annotation:in-data-[slot=button-group]:rounded-lg annotation:[&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "annotation:size-7 annotation:rounded-[min(var(--radius-md),12px)] annotation:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "annotation:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
