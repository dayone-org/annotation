import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "annotation:flex annotation:field-sizing-content annotation:min-h-12 annotation:w-full annotation:rounded-lg annotation:border annotation:border-input annotation:bg-transparent annotation:px-2.5 annotation:py-2 annotation:text-base annotation:transition-colors annotation:outline-none annotation:placeholder:text-muted-foreground annotation:disabled:cursor-not-allowed annotation:disabled:bg-input/50 annotation:disabled:opacity-50 annotation:aria-invalid:border-destructive annotation:aria-invalid:ring-3 annotation:aria-invalid:ring-destructive/20 annotation:md:text-sm annotation:dark:bg-input/30 annotation:dark:disabled:bg-input/80 annotation:dark:aria-invalid:border-destructive/50 annotation:dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
