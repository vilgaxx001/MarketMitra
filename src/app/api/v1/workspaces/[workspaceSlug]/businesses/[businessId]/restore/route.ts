import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { restoreBusiness } from "@/modules/business/service";

export const POST = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (_req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:archive");

  const business = await restoreBusiness(businessId, workspaceUser.workspaceId, workspaceUser.id);
  return apiSuccess(business);
});
