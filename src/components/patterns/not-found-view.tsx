/**
 * src/components/patterns/not-found-view.tsx
 *
 * Reused by the root app/not-found.tsx as well as scoped not-found.tsx
 * files (e.g. a workspace slug that doesn't exist or isn't accessible to
 * the current user, a project ID that's been deleted) — accepts context
 * so the message can be specific rather than a generic "404".
 */
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

function NotFoundView({
  title = "Page not found",
  description = "The page you're looking for doesn't exist or may have been moved.",
  backHref = "/",
  backLabel = "Go back home",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}

export { NotFoundView };
