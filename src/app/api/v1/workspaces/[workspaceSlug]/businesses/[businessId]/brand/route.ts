/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/brand/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { updateBrandIdentitySchema } from "@/modules/brand/validators";
import { getBrandIdentity, updateBrandIdentity } from "@/modules/brand/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

export const GET = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (_req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "brand:read");

  const brand = await getBrandIdentity(businessId, workspaceUser.workspaceId);
  return apiSuccess(brand);
});

export const PATCH = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "brand:edit");

  const parsedBody = await readBoundedJson(req, BODY_LIMITS.profile);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = updateBrandIdentitySchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const brand = await updateBrandIdentity(businessId, workspaceUser.workspaceId, workspaceUser.id, result.data);
  return apiSuccess(brand);
});
