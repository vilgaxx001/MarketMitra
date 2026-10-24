import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Users, Activity as ActivityIcon, ArrowRight } from "lucide-react";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { listBusinesses } from "@/modules/business/service";
import { listMembers } from "@/modules/team/service";
import { queryActivity } from "@/modules/activity/service";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * A real overview, not a placeholder — but deliberately scoped to what
 * Module 4 actually owns (businesses, team, recent activity). Content
 * generation / AI-agent widgets belong to later modules and aren't
 * faked here.
 */
export default async function DashboardPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspaceUser = await getWorkspaceUserOrRedirect(workspaceSlug);

  const [businesses, members, recentActivity] = await Promise.all([
    listBusinesses(workspaceUser.workspaceId),
    listMembers(workspaceUser.workspaceId),
    queryActivity({ workspaceId: workspaceUser.workspaceId, pageSize: 5 }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back, {workspaceUser.name.split(" ")[0]}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link href={`/${workspaceSlug}/businesses`} className="glass rounded-xl p-5 transition-transform hover:-translate-y-0.5">
          <Building2 className="size-5 text-secondary" aria-hidden="true" />
          <p className="mt-2 text-2xl font-bold text-foreground">{businesses.length}</p>
          <p className="text-sm text-muted-foreground">Business{businesses.length === 1 ? "" : "es"}</p>
        </Link>
        <Link href={`/${workspaceSlug}/team`} className="glass rounded-xl p-5 transition-transform hover:-translate-y-0.5">
          <Users className="size-5 text-secondary" aria-hidden="true" />
          <p className="mt-2 text-2xl font-bold text-foreground">{members.length}</p>
          <p className="text-sm text-muted-foreground">Team member{members.length === 1 ? "" : "s"}</p>
        </Link>
        <Link href={`/${workspaceSlug}/activity`} className="glass rounded-xl p-5 transition-transform hover:-translate-y-0.5">
          <ActivityIcon className="size-5 text-secondary" aria-hidden="true" />
          <p className="mt-2 text-2xl font-bold text-foreground">{recentActivity.totalCount}</p>
          <p className="text-sm text-muted-foreground">Recent actions</p>
        </Link>
      </div>

      {businesses.length === 0 && (
        <div className="glass mt-6 flex items-center justify-between rounded-xl p-5">
          <div>
            <h2 className="font-medium text-foreground">Set up your first business</h2>
            <p className="text-sm text-muted-foreground">Add your business profile and brand identity to get started.</p>
          </div>
          <Button asChild>
            <Link href={`/${workspaceSlug}/businesses/new`}>
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}

      {recentActivity.entries.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <Link href={`/${workspaceSlug}/activity`} className="text-xs text-secondary hover:underline">
              View all
            </Link>
          </div>
          <ul className="space-y-2">
            {recentActivity.entries.map((e) => (
              <li key={e.id} className="text-sm text-muted-foreground">
                <span className="text-foreground">{e.actorName ?? "Someone"}</span> — {e.action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
