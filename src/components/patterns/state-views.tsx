/**
 * src/components/patterns/state-views.tsx
 *
 * The four canonical states every data-fetching feature in the product
 * must render: Loading, Error, Empty, Success. Rather than each feature
 * (dashboard widget, project list, analytics chart) inventing its own
 * spinner/error markup, every one composes these primitives — so a
 * "failed to load" screen looks and behaves identically whether it's
 * billing history or AI generation history.
 *
 * These are intentionally dumb/presentational — no data fetching logic
 * lives here. See src/components/patterns/async-boundary.tsx for the
 * component that decides which of these to render based on query state.
 */
import * as React from "react";
import { AlertTriangle, Inbox, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * LoadingView — generic centered spinner state, for when a skeleton isn't
 * practical (e.g. full-page navigation transitions). Prefer a
 * feature-specific Skeleton layout over this when the eventual content
 * shape is known.
 * ---------------------------------------------------------------------- */
function LoadingView({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}
    >
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * ErrorView — shown when a request fails. Always offers a retry action
 * when one is meaningful; copy is written in the interface's voice
 * (states what happened, not an apology) per the writing guidelines.
 * ---------------------------------------------------------------------- */
function ErrorView({
  title = "Couldn't load this",
  description = "Something went wrong while fetching this data.",
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 bg-destructive/[0.03] py-16 text-center",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} leadingIcon={<RefreshCw />}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * EmptyState — shown when a request succeeds but returns zero items.
 * Per the writing guidelines, an empty screen is an invitation to act —
 * so `action` should almost always be provided (e.g. "Create your first
 * project") rather than leaving the user at a dead end.
 * ---------------------------------------------------------------------- */
function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * SuccessState — used for terminal success confirmations that replace a
 * form/flow entirely (e.g. "Subscription updated", "Email verified") —
 * not for transient action feedback, which is Toast's job.
 * ---------------------------------------------------------------------- */
function SuccessState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-success/20 bg-success/5 py-16 text-center",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-success/10">
        <svg
          className="size-5 text-success"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export { LoadingView, ErrorView, EmptyState, SuccessState };
