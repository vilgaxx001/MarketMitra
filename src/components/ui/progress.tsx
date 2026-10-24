/**
 * src/components/ui/progress.tsx
 *
 * Used for usage-limit indicators ("42 of 50 generations used this
 * month"), file upload progress, and onboarding step progress.
 */
"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** 0-100. Crosses into warning/destructive coloring automatically near the limit. */
  value: number;
  /** Switches the fill color to warning/destructive as value approaches 100 — used for usage-limit bars. */
  colorByValue?: boolean;
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, colorByValue, ...props }, ref) => {
    const fillColor = !colorByValue
      ? "bg-primary"
      : value >= 90
        ? "bg-destructive"
        : value >= 70
          ? "bg-warning"
          : "bg-primary";

    return (
      <ProgressPrimitive.Root
        ref={ref}
        className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn("h-full flex-1 transition-transform duration-slow ease-standard", fillColor)}
          style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
        />
      </ProgressPrimitive.Root>
    );
  }
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
