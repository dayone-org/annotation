import { Avatar as AvatarPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Avatar({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg";
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "annotation:group/avatar annotation:relative annotation:flex annotation:size-8 annotation:shrink-0 annotation:rounded-full annotation:select-none annotation:after:absolute annotation:after:inset-0 annotation:after:rounded-full annotation:after:border annotation:after:border-border annotation:after:mix-blend-darken annotation:data-[size=lg]:size-10 annotation:data-[size=sm]:size-6 annotation:dark:after:mix-blend-lighten",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        "annotation:aspect-square annotation:size-full annotation:rounded-full annotation:object-cover",
        className,
      )}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "annotation:flex annotation:size-full annotation:items-center annotation:justify-center annotation:rounded-full annotation:bg-muted annotation:text-sm annotation:text-muted-foreground annotation:group-data-[size=sm]/avatar:text-xs",
        className,
      )}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "annotation:absolute annotation:right-0 annotation:bottom-0 annotation:z-10 annotation:inline-flex annotation:items-center annotation:justify-center annotation:rounded-full annotation:bg-primary annotation:text-primary-foreground annotation:bg-blend-color annotation:ring-2 annotation:ring-background annotation:select-none",
        "annotation:group-data-[size=sm]/avatar:size-2 annotation:group-data-[size=sm]/avatar:[&>svg]:hidden",
        "annotation:group-data-[size=default]/avatar:size-2.5 annotation:group-data-[size=default]/avatar:[&>svg]:size-2",
        "annotation:group-data-[size=lg]/avatar:size-3 annotation:group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "annotation:group/avatar-group annotation:flex annotation:-space-x-2 annotation:*:data-[slot=avatar]:ring-2 annotation:*:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "annotation:relative annotation:flex annotation:size-8 annotation:shrink-0 annotation:items-center annotation:justify-center annotation:rounded-full annotation:bg-muted annotation:text-sm annotation:text-muted-foreground annotation:ring-2 annotation:ring-background annotation:group-has-data-[size=lg]/avatar-group:size-10 annotation:group-has-data-[size=sm]/avatar-group:size-6 annotation:[&>svg]:size-4 annotation:group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 annotation:group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge };
