import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "annotation:h-8 annotation:w-full annotation:min-w-0 annotation:rounded-lg annotation:border annotation:border-input annotation:bg-transparent annotation:px-2.5 annotation:py-1 annotation:text-base annotation:transition-colors annotation:outline-none annotation:file:inline-flex annotation:file:h-6 annotation:file:border-0 annotation:file:bg-transparent annotation:file:text-sm annotation:file:font-medium annotation:file:text-foreground annotation:placeholder:text-muted-foreground annotation:disabled:pointer-events-none annotation:disabled:cursor-not-allowed annotation:disabled:bg-input/50 annotation:disabled:opacity-50 annotation:aria-invalid:border-destructive annotation:aria-invalid:ring-3 annotation:aria-invalid:ring-destructive/20 annotation:md:text-sm annotation:dark:bg-input/30 annotation:dark:disabled:bg-input/80 annotation:dark:aria-invalid:border-destructive/50 annotation:dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
