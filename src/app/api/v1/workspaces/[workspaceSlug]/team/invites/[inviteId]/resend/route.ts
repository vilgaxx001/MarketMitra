import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { getWorkspaceBySlug } from "@/modules/workspace/service";
import { resendInvite } from "@/modules/team/service";

export const POST = withApiHandler<{ workspaceSlug: string; inviteId: string }>(async (_req, { params }) => {
  const { workspaceSlug, inviteId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "team:invite");

  const workspace = await getWorkspaceBySlug(workspaceSlug);
  await resendInvite(inviteId, workspaceUser.workspaceId, workspaceUser.id, workspace.name, workspaceUser.name);
  return apiSuccess({ resent: true });
});
