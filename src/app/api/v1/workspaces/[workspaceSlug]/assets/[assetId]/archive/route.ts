import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { archiveAsset } from "@/modules/assets/service";

export const POST = withApiHandler<{ workspaceSlug: string; assetId: string }>(async (_req, { params }) => {
  const { workspaceSlug, assetId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "asset:delete");

  await archiveAsset(assetId, workspaceUser.workspaceId, workspaceUser.id);
  return apiSuccess({ archived: true });
});
