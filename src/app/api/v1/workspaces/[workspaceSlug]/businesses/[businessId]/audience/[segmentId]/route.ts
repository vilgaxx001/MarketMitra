/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/audience/[segmentId]/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { updateAudienceSegmentSchema } from "@/modules/audience/validators";
import { updateSegment, archiveSegment } from "@/modules/audience/service";

export const PATCH = withApiHandler<{ workspaceSlug: string; businessId: string; segmentId: string }>(
  async (req, { params }) => {
    const { workspaceSlug, businessId, segmentId } = await params;
    const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
    await requirePermission(workspaceUser, "audience:edit");

    const body = await req.json();
    const result = updateAudienceSegmentSchema.safeParse(body);
    if (!result.success) return apiValidationError(result.error);

    const segment = await updateSegment(segmentId, businessId, workspaceUser.workspaceId, workspaceUser.id, result.data);
    return apiSuccess(segment);
  }
);

export const DELETE = withApiHandler<{ workspaceSlug: string; businessId: string; segmentId: string }>(
  async (_req, { params }) => {
    const { workspaceSlug, businessId, segmentId } = await params;
    const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
    await requirePermission(workspaceUser, "audience:archive");

    await archiveSegment(segmentId, businessId, workspaceUser.workspaceId, workspaceUser.id);
    return apiSuccess({ archived: true });
  }
);
