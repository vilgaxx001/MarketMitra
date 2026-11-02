/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { createBusinessSchema } from "@/modules/business/validators";
import { createBusiness, listBusinesses } from "@/modules/business/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

export const GET = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:read");

  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true";
  const businesses = await listBusinesses(workspaceUser.workspaceId, includeArchived);
  return apiSuccess(businesses);
});

export const POST = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:create");

  const parsedBody = await readBoundedJson(req, BODY_LIMITS.profile);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = createBusinessSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const business = await createBusiness(workspaceUser.workspaceId, workspaceUser.id, result.data);
  return apiSuccess(business);
});
