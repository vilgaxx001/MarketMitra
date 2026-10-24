/**
 * src/app/api/v1/workspaces/[workspaceSlug]/leave/route.ts
 *
 * No requirePermission() guard — leaving is gated by "are you a member
 * of this workspace" (already checked by requireWorkspaceAccess), not
 * by a role permission. The last-admin-can't-leave rule is enforced
 * inside leaveWorkspace() itself.
 */
import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { leaveWorkspace } from "@/modules/workspace/service";

export const POST = withApiHandler<{ workspaceSlug: string }>(async (_req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);

  await leaveWorkspace(workspaceUser.workspaceId, workspaceUser.id);
  return apiSuccess({ left: true });
});
