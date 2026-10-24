/**
 * src/components/ui/button.tsx
 *
 * The single Button implementation used everywhere in the product —
 * marketing CTAs, form submits, icon-only toolbar actions, destructive
 * confirmations. Variants are defined once via cva() so "what does a
 * destructive button look like" has one answer, not one per feature.
 */
"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    "transition-colors duration-fast ease-standard",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/95",
        secondary:
          "bg-secondary-foreground/[0.04] text-foreground border border-border hover:bg-secondary-foreground/[0.07]",
        outline: "border border-input bg-transparent hover:bg-muted",
        ghost: "bg-transparent hover:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-9 px-4 [&_svg]:size-4",
        lg: "h-11 px-6 text-base [&_svg]:size-[1.125rem]",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renders the single child element directly (e.g. a Next.js <Link>) instead of a <button>, preserving styles. Icons/spinner props are NOT applied in this mode: place them inside the child. */
  asChild?: boolean;
  /** Shows a spinner and disables the button — use for async actions (form submit, AI generation). */
  isLoading?: boolean;
  /** Optional icon rendered before the label. */
  leadingIcon?: React.ReactNode;
  /** Optional icon rendered after the label. */
  trailingIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      leadingIcon,
      trailingIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const classes = cn(buttonVariants({ variant, size, className }));

    if (asChild) {
      // Radix <Slot> merges its props into EXACTLY ONE child element and throws ("React.Children.only expected to receive a
      // single React element child") when handed several, even if some are undefined/false. Rendering the icon/spinner slots
      // next to `children` here made every <Button asChild> (marketing nav, pricing, not-found) crash its page with a 500.
      // So with asChild only `children` (the single element, e.g. a <Link>) is rendered: put any icon inside that element.
      return (
        <Slot
          ref={ref}
          className={classes}
          aria-busy={isLoading || undefined}
          aria-disabled={disabled || isLoading || undefined}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          leadingIcon
        )}
        {children}
        {!isLoading && trailingIcon}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
