/**
 * src/components/ui/badge.tsx
 *
 * Status pills used across the product: subscription status (Active/Past
 * Due/Canceled), content status (Draft/Published), role labels
 * (Admin/Team Member/Client), plan tier indicators.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-fast",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary-foreground/[0.06] text-foreground",
        primary: "border-transparent bg-primary/10 text-primary",
        success: "border-transparent bg-success/10 text-success",
        warning: "border-transparent bg-warning/10 text-warning",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        info: "border-transparent bg-info/10 text-info",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Small status dot rendered before the label — useful for "Active"/"Live" type badges. */
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-success",
            variant === "warning" && "bg-warning",
            variant === "destructive" && "bg-destructive",
            variant === "primary" && "bg-primary",
            variant === "info" && "bg-info",
            (!variant || variant === "default" || variant === "outline") && "bg-muted-foreground"
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
