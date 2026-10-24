/**
 * src/components/ui/drawer.tsx
 *
 * Slide-in panel from any edge — used for the notification panel, mobile
 * sidebar navigation, and project detail quick-view. Built on Radix
 * Dialog (same focus-trap/scroll-lock guarantees as Modal) with
 * positional variants instead of always centering.
 */
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeTransition } from "@/lib/motion";

const Drawer = DialogPrimitive.Root;
const DrawerTrigger = DialogPrimitive.Trigger;
const DrawerPortal = DialogPrimitive.Portal;
const DrawerClose = DialogPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-modal-backdrop bg-foreground/40 backdrop-blur-[2px]", fadeTransition, className)}
    {...props}
  />
));
DrawerOverlay.displayName = DialogPrimitive.Overlay.displayName;

const drawerVariants = cva("fixed z-modal bg-card border-border shadow-xl flex flex-col", {
  variants: {
    side: {
      right: cn(
        "inset-y-0 right-0 h-full w-full max-w-md border-l",
        "data-[state=open]:animate-slide-in-from-right data-[state=closed]:animate-slide-out-to-right"
      ),
      left: cn(
        "inset-y-0 left-0 h-full w-full max-w-md border-r",
        "data-[state=open]:animate-[slide-in-from-right_var(--duration-moderate)_var(--ease-decelerate)_reverse]"
      ),
      bottom: cn(
        "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-xl border-t",
        "data-[state=open]:animate-slide-in-from-bottom"
      ),
    },
  },
  defaultVariants: { side: "right" },
});

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & VariantProps<typeof drawerVariants>
>(({ side, className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(drawerVariants({ side }), className)}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className={cn(
          "absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70",
          "transition-opacity hover:opacity-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1 border-b border-border p-5 pr-12", className)} {...props} />
);

const DrawerBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 overflow-y-auto p-5", className)} {...props} />
);

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center justify-end gap-2 border-t border-border p-4", className)} {...props} />
);

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-base font-semibold", className)} {...props} />
));
DrawerTitle.displayName = DialogPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DrawerDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
};
