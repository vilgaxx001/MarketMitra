import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { listAssets } from "@/modules/assets/service";
import type { FileAssetCategory } from "@prisma/client";

export const GET = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "asset:read");

  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");
  const category = url.searchParams.get("category") as FileAssetCategory | null;

  const assets = await listAssets(workspaceUser.workspaceId, {
    ...(businessId !== null && { businessId }),
    ...(category && { category }),
  });
  return apiSuccess(assets);
});
