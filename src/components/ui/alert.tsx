/**
 * src/components/ui/alert.tsx
 *
 * Inline, persistent contextual messages (e.g. "Your trial ends in 3
 * days", "This workspace has reached its plan limit") — distinct from
 * Toast, which is transient and for action feedback. Alert stays
 * visible until dismissed or the underlying condition changes.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&:has(svg)]:pl-11",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground [&>svg]:text-muted-foreground",
        info: "border-info/20 bg-info/5 text-foreground [&>svg]:text-info",
        success: "border-success/20 bg-success/5 text-foreground [&>svg]:text-success",
        warning: "border-warning/20 bg-warning/5 text-foreground [&>svg]:text-warning",
        destructive: "border-destructive/20 bg-destructive/5 text-foreground [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const variantIcon = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  destructive: XCircle,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Set false to omit the leading status icon. */
  showIcon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", showIcon = true, children, ...props }, ref) => {
    const Icon = variantIcon[variant ?? "default"];
    return (
      <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
        {showIcon && <Icon aria-hidden="true" />}
        {children}
      </div>
    );
  }
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
  )
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertVariants };
