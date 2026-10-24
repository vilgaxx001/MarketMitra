/**
 * src/components/ui/skeleton.tsx
 *
 * Base shimmer block. Compose into feature-specific skeletons (e.g. a
 * "ProjectCardSkeleton" in the projects module) by stacking Skeleton
 * elements in the target component's exact layout shape, rather than
 * showing a generic spinner — this is what makes loading states feel
 * fast (the user sees the page's structure arrive immediately).
 */
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} {...props} />;
}

export { Skeleton };
