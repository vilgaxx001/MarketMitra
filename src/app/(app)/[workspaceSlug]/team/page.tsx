import type { Metadata } from "next";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { can } from "@/modules/rbac";
import { listMembers, listPendingInvites } from "@/modules/team/service";
import { TeamPageClient } from "./_components/team-page-client";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspaceUser = await getWorkspaceUserOrRedirect(workspaceSlug);

  const [members, invites] = await Promise.all([
    listMembers(workspaceUser.workspaceId),
    can(workspaceUser, "team:view") ? listPendingInvites(workspaceUser.workspaceId) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Team</h1>
      <TeamPageClient
        workspaceSlug={workspaceSlug}
        currentUserId={workspaceUser.id}
        initialMembers={members}
        initialInvites={invites}
        canManage={can(workspaceUser, "team:invite")}
      />
    </div>
  );
}
