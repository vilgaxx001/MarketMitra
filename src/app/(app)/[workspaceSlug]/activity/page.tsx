import type { Metadata } from "next";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { queryActivity } from "@/modules/activity/service";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/state-views";
import { Activity } from "lucide-react";

export const metadata: Metadata = { title: "Activity" };

const ACTION_LABELS: Record<string, string> = {
  "workspace.created": "created the workspace",
  "workspace.updated": "updated workspace settings",
  "workspace.archived": "archived the workspace",
  "workspace.restored": "restored the workspace",
  "business.created": "created a business",
  "business.updated": "updated a business profile",
  "business.archived": "archived a business",
  "business.restored": "restored a business",
  "business.active_changed": "switched active business",
  "brand.updated": "updated brand identity",
  "member.invited": "invited a member",
  "member.invite_resent": "resent an invitation",
  "member.invite_revoked": "revoked an invitation",
  "member.role_changed": "changed a member's role",
  "member.removed": "removed a member",
  "asset.uploaded": "uploaded a file",
  "asset.version_created": "uploaded a new file version",
  "asset.archived": "archived a file",
  "audience.created": "created an audience segment",
  "audience.updated": "updated an audience segment",
  "audience.archived": "archived an audience segment",
  "audience.primary_changed": "changed the primary audience",
  "onboarding.completed": "completed onboarding",
  "ai_preferences.updated": "updated AI preferences",
  "ai_preferences.reset": "reset AI preferences to defaults",
  "ai_memory.created": "added an AI memory",
  "ai_memory.updated": "updated an AI memory",
  "ai_memory.archived": "archived an AI memory",
  "ai_memory.restored": "restored an AI memory",
  "ai_memory.deleted": "deleted an AI memory",
};

export default async function ActivityPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspaceUser = await getWorkspaceUserOrRedirect(workspaceSlug);
  await requirePermission(workspaceUser, "activity:read");

  const { entries } = await queryActivity({ workspaceId: workspaceUser.workspaceId, pageSize: 50 });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Activity</h1>

      {entries.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={Activity} title="No activity yet" description="Actions taken in this workspace will show up here." />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="glass flex items-start gap-3 rounded-lg p-3">
              <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-secondary" />
              <div>
                <p className="text-sm text-foreground">
                  <span className="font-medium">{entry.actorName ?? "Someone"}</span>{" "}
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt, { hour: "numeric", minute: "numeric" })}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
