import { cva, type VariantProps } from "class-variance-authority";
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "annotation:flex annotation:flex-col annotation:gap-4 annotation:has-[>[data-slot=checkbox-group]]:gap-3 annotation:has-[>[data-slot=radio-group]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "annotation:mb-1.5 annotation:font-medium annotation:data-[variant=label]:text-sm annotation:data-[variant=legend]:text-base",
        className,
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "annotation:group/field-group annotation:@container/field-group annotation:flex annotation:w-full annotation:flex-col annotation:gap-5 annotation:data-[slot=checkbox-group]:gap-3 annotation:*:data-[slot=field-group]:gap-4",
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva(
  "annotation:group/field annotation:flex annotation:w-full annotation:gap-2 annotation:data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "annotation:flex-col annotation:*:w-full annotation:[&>.sr-only]:w-auto",
        horizontal:
          "annotation:flex-row annotation:items-center annotation:has-[>[data-slot=field-content]]:items-start annotation:*:data-[slot=field-label]:flex-auto annotation:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "annotation:flex-col annotation:*:w-full annotation:@md/field-group:flex-row annotation:@md/field-group:items-center annotation:@md/field-group:*:w-auto annotation:@md/field-group:has-[>[data-slot=field-content]]:items-start annotation:@md/field-group:*:data-[slot=field-label]:flex-auto annotation:[&>.sr-only]:w-auto annotation:@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  },
);

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "annotation:group/field-content annotation:flex annotation:flex-1 annotation:flex-col annotation:gap-0.5 annotation:leading-snug",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "annotation:group/field-label annotation:peer/field-label annotation:flex annotation:w-fit annotation:gap-2 annotation:leading-snug annotation:group-data-[disabled=true]/field:opacity-50 annotation:has-data-[state=checked]:border-primary/30 annotation:has-data-[state=checked]:bg-primary/5 annotation:has-[>[data-slot=field]]:rounded-lg annotation:has-[>[data-slot=field]]:border annotation:*:data-[slot=field]:p-2.5 annotation:dark:has-data-[state=checked]:border-primary/20 annotation:dark:has-data-[state=checked]:bg-primary/10",
        "annotation:has-[>[data-slot=field]]:w-full annotation:has-[>[data-slot=field]]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "annotation:flex annotation:w-fit annotation:items-center annotation:gap-2 annotation:text-sm annotation:leading-snug annotation:font-medium annotation:group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "annotation:text-left annotation:text-sm annotation:leading-normal annotation:font-normal annotation:text-muted-foreground annotation:group-data-[orientation=horizontal]/field:text-balance annotation:[[data-variant=legend]+&]:-mt-1.5",
        "annotation:last:mt-0 annotation:nth-last-2:-mt-1",
        "annotation:[&>a]:underline annotation:[&>a]:underline-offset-4 annotation:[&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "annotation:relative annotation:-my-2 annotation:h-5 annotation:text-sm annotation:group-data-[variant=outline]/field-group:-mb-2",
        className,
      )}
      {...props}
    >
      <Separator className="annotation:absolute annotation:inset-0 annotation:top-1/2" />
      {children && (
        <span
          className="annotation:relative annotation:mx-auto annotation:block annotation:w-fit annotation:bg-background annotation:px-2 annotation:text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [...new Map(errors.map((error) => [error?.message, error])).values()];

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="annotation:ml-4 annotation:flex annotation:list-disc annotation:flex-col annotation:gap-1">
        {uniqueErrors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn(
        "annotation:text-sm annotation:font-normal annotation:text-destructive",
        className,
      )}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
