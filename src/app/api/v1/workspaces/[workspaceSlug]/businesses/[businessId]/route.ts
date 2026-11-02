/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { updateBusinessSchema } from "@/modules/business/validators";
import { getBusiness, updateBusiness } from "@/modules/business/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

export const GET = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (_req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:read");

  const business = await getBusiness(businessId, workspaceUser.workspaceId);
  return apiSuccess(business);
});

export const PATCH = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:edit");

  const parsedBody = await readBoundedJson(req, BODY_LIMITS.profile);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = updateBusinessSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const business = await updateBusiness(businessId, workspaceUser.workspaceId, workspaceUser.id, result.data);
  return apiSuccess(business);
});
