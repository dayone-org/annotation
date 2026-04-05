import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/components/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "annotation:relative annotation:flex annotation:w-full annotation:touch-none annotation:items-center annotation:select-none annotation:data-disabled:opacity-50 annotation:data-[orientation=vertical]:h-full annotation:data-[orientation=vertical]:min-h-40 annotation:data-[orientation=vertical]:w-auto annotation:data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="annotation:relative annotation:grow annotation:overflow-hidden annotation:rounded-full annotation:bg-muted annotation:data-[orientation=horizontal]:h-1 annotation:data-[orientation=horizontal]:w-full annotation:data-[orientation=vertical]:h-full annotation:data-[orientation=vertical]:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="annotation:absolute annotation:bg-primary annotation:select-none annotation:data-[orientation=horizontal]:h-full annotation:data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="annotation:relative annotation:block annotation:size-3 annotation:shrink-0 annotation:rounded-full annotation:border annotation:border-ring annotation:bg-white annotation:ring-ring/50 annotation:transition-[color,box-shadow] annotation:select-none annotation:after:absolute annotation:after:-inset-2 annotation:hover:ring-3 annotation:focus-visible:ring-3 annotation:focus-visible:outline-hidden annotation:active:ring-3 annotation:disabled:pointer-events-none annotation:disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
