/**
 * src/components/ui/avatar.tsx
 *
 * User/workspace avatar with automatic initials fallback when no image
 * is set or the image fails to load — never shows a broken image icon.
 */
"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva("relative flex shrink-0 overflow-hidden rounded-full bg-muted", {
  variants: {
    size: {
      xs: "size-6 text-[0.65rem]",
      sm: "size-8 text-xs",
      md: "size-10 text-sm",
      lg: "size-14 text-base",
      xl: "size-20 text-xl",
    },
  },
  defaultVariants: { size: "md" },
});

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & VariantProps<typeof avatarVariants>
>(({ className, size, ...props }, ref) => (
  <AvatarPrimitive.Root ref={ref} className={cn(avatarVariants({ size }), className)} {...props} />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn("aspect-square size-full object-cover", className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex size-full items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary font-semibold text-primary-foreground",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

/**
 * Convenience wrapper for the common case: render a user/workspace avatar
 * from a name and optional image URL, with initials auto-derived.
 *
 * USAGE: <UserAvatar name="Priya Sharma" src={user.avatarUrl} size="sm" />
 */
function UserAvatar({
  name,
  src,
  size,
  className,
}: {
  name: string;
  src?: string | null;
  size?: VariantProps<typeof avatarVariants>["size"];
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <Avatar size={size} className={className}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback>{initials || "?"}</AvatarFallback>
    </Avatar>
  );
}

export { Avatar, AvatarImage, AvatarFallback, UserAvatar, avatarVariants };
