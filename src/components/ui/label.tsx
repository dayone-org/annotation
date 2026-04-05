import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "annotation:flex annotation:items-center annotation:gap-2 annotation:text-sm annotation:leading-none annotation:font-medium annotation:select-none annotation:group-data-[disabled=true]:pointer-events-none annotation:group-data-[disabled=true]:opacity-50 annotation:peer-disabled:cursor-not-allowed annotation:peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
