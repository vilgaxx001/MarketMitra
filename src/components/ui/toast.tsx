/**
 * src/components/ui/toast.tsx
 *
 * Transient action-feedback notifications ("Project saved", "Failed to
 * upload logo — try again"). Built on `sonner` rather than a hand-rolled
 * toast stack — sonner already solves stacking, swipe-to-dismiss, and
 * pause-on-hover correctly, and we only need to theme it to our tokens.
 *
 * <Toaster /> is mounted once in src/components/layout/providers.tsx.
 * Everywhere else, import `toast` from this file (not directly from
 * "sonner") so the API surface stays swappable and consistently themed.
 */
"use client";

import { Toaster as SonnerToaster, toast } from "sonner";
import { useTheme } from "next-themes";
import { CheckCircle2, XCircle, AlertCircle, Info, Loader2 } from "lucide-react";

function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      gap={10}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group rounded-lg border border-border bg-card text-card-foreground shadow-lg z-toast font-sans text-sm",
          title: "font-medium",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground rounded-md text-xs px-2.5 py-1.5",
          cancelButton: "bg-muted text-muted-foreground rounded-md text-xs px-2.5 py-1.5",
          closeButton: "border-border bg-card text-muted-foreground",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-info",
        },
      }}
      icons={{
        success: <CheckCircle2 className="size-4" />,
        error: <XCircle className="size-4" />,
        warning: <AlertCircle className="size-4" />,
        info: <Info className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      closeButton
    />
  );
}

export { Toaster, toast };
