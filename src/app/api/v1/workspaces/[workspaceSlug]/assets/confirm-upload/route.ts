import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { confirmUploadSchema } from "@/modules/assets/validators";
import { confirmUpload } from "@/modules/assets/service";

export const POST = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "asset:create");

  const body = await req.json();
  const result = confirmUploadSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const asset = await confirmUpload(workspaceUser.workspaceId, workspaceUser.id, result.data);
  return apiSuccess(asset);
});
