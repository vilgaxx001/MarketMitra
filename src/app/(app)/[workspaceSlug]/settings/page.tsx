import type { Metadata } from "next";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { can } from "@/modules/rbac";
import { getWorkspaceBySlug } from "@/modules/workspace/service";
import { WorkspaceSettingsForm } from "./_components/workspace-settings-form";

export const metadata: Metadata = { title: "Workspace Settings" };

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspaceUser = await getWorkspaceUserOrRedirect(workspaceSlug);
  const workspace = await getWorkspaceBySlug(workspaceSlug);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Workspace settings</h1>
      <div className="glass mt-6 rounded-xl p-6">
        <WorkspaceSettingsForm
          workspace={workspace}
          canEdit={can(workspaceUser, "workspace:edit")}
          canArchive={can(workspaceUser, "workspace:archive")}
        />
      </div>
    </div>
  );
}
