import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "annotation:pointer-events-none annotation:inline-flex annotation:h-5 annotation:w-fit annotation:min-w-5 annotation:items-center annotation:justify-center annotation:gap-1 annotation:rounded-sm annotation:bg-muted annotation:px-1 annotation:text-xs annotation:font-medium annotation:text-muted-foreground annotation:select-none annotation:in-data-[slot=tooltip-content]:bg-background/20 annotation:in-data-[slot=tooltip-content]:text-background annotation:dark:in-data-[slot=tooltip-content]:bg-background/10 annotation:[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("annotation:inline-flex annotation:items-center annotation:gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
