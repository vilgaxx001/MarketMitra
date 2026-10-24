/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/switch-active/route.ts
 *
 * Sets which business is "active" for this user within this workspace.
 * Gated only by business:read (viewing/switching, not mutating data) —
 * requireBusinessAccess() re-verifies the business actually belongs to
 * this workspace before the cookie is set, so a tampered businessId in
 * the URL can't be used to mark a foreign business "active."
 */
import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requireBusinessAccess, setActiveBusinessCookie } from "@/lib/middleware/require-business";
import { requirePermission } from "@/modules/rbac";
import { logActivity } from "@/modules/activity/service";

export const POST = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (_req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:read");

  const business = await requireBusinessAccess(workspaceUser, businessId);
  await setActiveBusinessCookie(workspaceUser.workspaceId, business.id);

  await logActivity({
    workspaceId: workspaceUser.workspaceId,
    actorId: workspaceUser.id,
    action: "business.active_changed",
    targetType: "business",
    targetId: business.id,
    metadata: { businessId: business.id },
  });

  return apiSuccess({ activeBusinessId: business.id });
});
