import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "annotation:group/badge annotation:inline-flex annotation:h-5 annotation:w-fit annotation:shrink-0 annotation:items-center annotation:justify-center annotation:gap-1 annotation:overflow-hidden annotation:rounded-4xl annotation:border annotation:border-transparent annotation:px-2 annotation:py-0.5 annotation:text-xs annotation:font-medium annotation:whitespace-nowrap annotation:transition-all annotation:has-data-[icon=inline-end]:pr-1.5 annotation:has-data-[icon=inline-start]:pl-1.5 annotation:aria-invalid:border-destructive annotation:aria-invalid:ring-destructive/20 annotation:dark:aria-invalid:ring-destructive/40 annotation:[&>svg]:pointer-events-none annotation:[&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "annotation:bg-primary annotation:text-primary-foreground annotation:[a]:hover:bg-primary/80",
        secondary:
          "annotation:bg-secondary annotation:text-secondary-foreground annotation:[a]:hover:bg-secondary/80",
        destructive:
          "annotation:bg-destructive/10 annotation:text-destructive annotation:dark:bg-destructive/20 annotation:[a]:hover:bg-destructive/20",
        outline:
          "annotation:border-border annotation:text-foreground annotation:[a]:hover:bg-muted annotation:[a]:hover:text-muted-foreground",
        ghost:
          "annotation:hover:bg-muted annotation:hover:text-muted-foreground annotation:dark:hover:bg-muted/50",
        link: "annotation:text-primary annotation:underline-offset-4 annotation:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
