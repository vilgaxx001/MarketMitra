/**
 * src/app/api/v1/workspaces/[workspaceSlug]/archive/route.ts
 */
import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { archiveWorkspace } from "@/modules/workspace/service";

export const POST = withApiHandler<{ workspaceSlug: string }>(async (_req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "workspace:archive");

  const workspace = await archiveWorkspace(workspaceUser.workspaceId, workspaceUser.id);
  return apiSuccess(workspace);
});
