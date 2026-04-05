import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "annotation:peer annotation:group/switch annotation:relative annotation:inline-flex annotation:shrink-0 annotation:items-center annotation:justify-start annotation:rounded-full annotation:border annotation:border-transparent annotation:transition-all annotation:outline-none annotation:after:absolute annotation:after:-inset-x-3 annotation:after:-inset-y-2 annotation:aria-invalid:border-destructive annotation:aria-invalid:ring-3 annotation:aria-invalid:ring-destructive/20 annotation:data-[state=checked]:bg-primary annotation:data-disabled:cursor-not-allowed annotation:data-disabled:opacity-50 annotation:data-[state=unchecked]:bg-input annotation:data-[size=default]:h-[18.4px] annotation:data-[size=default]:w-[32px] annotation:data-[size=sm]:h-[14px] annotation:data-[size=sm]:w-[24px] annotation:dark:aria-invalid:border-destructive/50 annotation:dark:aria-invalid:ring-destructive/40 annotation:dark:data-[state=unchecked]:bg-input/80",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="annotation:pointer-events-none annotation:block annotation:translate-x-0 annotation:rounded-full annotation:bg-background annotation:ring-0 annotation:transition-transform annotation:group-data-[size=default]/switch:size-4 annotation:group-data-[size=sm]/switch:size-3 annotation:group-data-[size=default]/switch:data-[state=checked]:translate-x-[calc(100%-2px)] annotation:group-data-[size=sm]/switch:data-[state=checked]:translate-x-[calc(100%-2px)] annotation:dark:data-[state=checked]:bg-primary-foreground annotation:dark:data-[state=unchecked]:bg-foreground"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
