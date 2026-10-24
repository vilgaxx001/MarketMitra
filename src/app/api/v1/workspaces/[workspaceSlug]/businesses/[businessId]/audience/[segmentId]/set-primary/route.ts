import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { setPrimarySegment } from "@/modules/audience/service";

export const POST = withApiHandler<{ workspaceSlug: string; businessId: string; segmentId: string }>(
  async (_req, { params }) => {
    const { workspaceSlug, businessId, segmentId } = await params;
    const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
    await requirePermission(workspaceUser, "audience:edit");

    const segment = await setPrimarySegment(segmentId, businessId, workspaceUser.workspaceId, workspaceUser.id);
    return apiSuccess(segment);
  }
);
