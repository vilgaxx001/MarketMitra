/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/audience/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { audienceSegmentSchema } from "@/modules/audience/validators";
import { listSegments, createSegment } from "@/modules/audience/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

export const GET = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "audience:read");

  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true";
  const segments = await listSegments(businessId, workspaceUser.workspaceId, includeArchived);
  return apiSuccess(segments);
});

export const POST = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "audience:create");

  const parsedBody = await readBoundedJson(req, BODY_LIMITS.profile);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = audienceSegmentSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const segment = await createSegment(businessId, workspaceUser.workspaceId, workspaceUser.id, result.data);
  return apiSuccess(segment);
});
