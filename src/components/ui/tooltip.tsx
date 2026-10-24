/**
 * src/components/ui/tooltip.tsx
 *
 * TooltipProvider should be mounted once near the app root (see
 * src/components/layout/providers.tsx) — individual Tooltip instances
 * then share its delayDuration config rather than each redeclaring it.
 */
"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { fadeTransition } from "@/lib/motion";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-tooltip overflow-hidden rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md",
        fadeTransition,
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Convenience wrapper for the common case of a single-element tooltip,
 * avoiding the four-component nesting boilerplate at every call site.
 *
 * USAGE: <SimpleTooltip label="Delete project"><Button ... /></SimpleTooltip>
 */
function SimpleTooltip({
  label,
  children,
  side = "top",
}: {
  label: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, SimpleTooltip };
