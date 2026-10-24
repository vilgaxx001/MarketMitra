/**
 * src/app/dashboard/page.tsx
 *
 * Bare `/dashboard` entry point. This is NOT the dashboard UI itself —
 * the real dashboard lives at the workspace-scoped route
 * `/[workspaceSlug]/dashboard` (see src/app/(app)/[workspaceSlug]/dashboard,
 * scaffolded but not yet built). This route exists so every "go to your
 * dashboard" action across the app (the marketing site's logged-in CTAs,
 * `getWorkspaceUserOrRedirect`'s FORBIDDEN fallback in
 * src/lib/middleware/require-auth.ts) has one stable, workspace-agnostic
 * URL to point at, and resolves it to the right workspace server-side.
 *
 * `middleware.ts` already protects this path (it's in
 * `PROTECTED_PREFIXES`), so by the time this Server Component renders,
 * the visitor is guaranteed to be authenticated — `requireAuth()` below
 * is a defensive re-check, not the primary guard.
 *
 * WHAT HAPPENS TO A BRAND-NEW USER WITH NO WORKSPACE YET: workspace
 * creation / onboarding is not built in this module — `authService.signup()`
 * (src/modules/auth/service.ts) creates a `User` row only, no `Workspace`.
 * Rather than redirect into a 404 or silently invent a workspace, this
 * page renders an honest interim state explaining that workspace setup
 * is the next step, with the correct integration point noted for the
 * module that builds it.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/middleware/require-auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";

export default async function DashboardResolverPage() {
  const session = await requireAuth().catch(() => null);
  if (!session) redirect("/login?redirect=/dashboard");

  const membership = await db.workspaceMember.findFirst({
    where: { userId: session.userId, workspace: { isActive: true } },
    orderBy: { joinedAt: "asc" },
    include: { workspace: { select: { slug: true } } },
  });

  if (membership) {
    redirect(`/${membership.workspace.slug}/dashboard`);
  }

  // No workspace yet — honest interim state, not a fabricated dashboard.
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Let&apos;s set up your workspace
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        You&apos;re signed in, but workspace creation isn&apos;t connected yet — it&apos;s
        built in a later module. Once it lands, this page will send you straight into
        your workspace dashboard automatically.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
