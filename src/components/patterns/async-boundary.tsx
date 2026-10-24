/**
 * src/components/patterns/async-boundary.tsx
 *
 * The single decision point for "what do I render given the state of this
 * data fetch" — referenced throughout docs/ARCHITECTURE.md as the pattern
 * every feature (dashboard widgets, project lists, billing history,
 * analytics) is expected to use instead of reimplementing
 * loading/error/empty conditionals inline.
 *
 * Deliberately framework-agnostic about *how* data was fetched — it works
 * identically whether the caller is a Server Component awaiting a
 * service call, or a Client Component using a data-fetching hook, as
 * long as the caller can express its state as { status, error, data }.
 *
 * USAGE (Client Component with a hook):
 *   const { data, status, error, refetch } = useProjects(workspaceId);
 *   return (
 *     <AsyncBoundary
 *       status={status}
 *       error={error}
 *       data={data}
 *       onRetry={refetch}
 *       isEmpty={(d) => d.length === 0}
 *       loadingFallback={<ProjectListSkeleton />}
 *       emptyFallback={
 *         <EmptyState title="No projects yet" action={<Button>New project</Button>} />
 *       }
 *     >
 *       {(projects) => <ProjectList projects={projects} />}
 *     </AsyncBoundary>
 *   );
 *
 * USAGE (Server Component — status is always "success" or the call threw,
 * which the route's error.tsx boundary catches; AsyncBoundary here is
 * mainly used for the empty-check + consistent EmptyState UI):
 *   const projects = await projectService.list(workspaceId);
 *   return (
 *     <AsyncBoundary status="success" data={projects} isEmpty={(d) => d.length === 0} ...>
 *       {(projects) => <ProjectList projects={projects} />}
 *     </AsyncBoundary>
 *   );
 */
"use client";

import * as React from "react";
import { LoadingView, ErrorView, EmptyState } from "@/components/patterns/state-views";
import { Skeleton } from "@/components/ui/skeleton";

export type AsyncStatus = "idle" | "loading" | "error" | "success";

export interface AsyncBoundaryProps<T> {
  status: AsyncStatus;
  data: T | undefined | null;
  error?: Error | { message: string } | null;
  /** Predicate deciding whether successfully-fetched data counts as "empty" (e.g. an array with length 0). */
  isEmpty?: (data: T) => boolean;
  onRetry?: () => void;
  loadingFallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  emptyFallback?: React.ReactNode;
  /** Render prop for the success case — receives the narrowed, non-null data. */
  children: (data: T) => React.ReactNode;
  className?: string;
}

function AsyncBoundary<T>({
  status,
  data,
  error,
  isEmpty,
  onRetry,
  loadingFallback,
  errorFallback,
  emptyFallback,
  children,
  className,
}: AsyncBoundaryProps<T>) {
  if (status === "loading" || status === "idle") {
    return <>{loadingFallback ?? <LoadingView className={className} />}</>;
  }

  if (status === "error") {
    if (errorFallback) return <>{errorFallback}</>;
    return (
      <ErrorView
        description={error?.message ?? "Something went wrong while fetching this data."}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  // status === "success"
  if (data == null || (isEmpty && isEmpty(data))) {
    return <>{emptyFallback ?? <EmptyState title="Nothing here yet" className={className} />}</>;
  }

  return <>{children(data)}</>;
}

/**
 * Convenience skeleton composer — stack N rows of a given skeleton shape.
 * Used for list-shaped loading states (table rows, card grids) so the
 * loading view visually previews the eventual layout.
 *
 * USAGE: <SkeletonList count={5} className="h-16 w-full" />
 */
function SkeletonList({
  count = 3,
  className,
  gap = "gap-3",
}: {
  count?: number;
  className?: string;
  gap?: string;
}) {
  return (
    <div className={`flex flex-col ${gap}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={className ?? "h-16 w-full"} />
      ))}
    </div>
  );
}

export { AsyncBoundary, SkeletonList };
