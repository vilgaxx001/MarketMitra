/**
 * src/app/api/v1/workspaces/[workspaceSlug]/activity/route.ts
 *
 * Query contract for the future Module 9 Admin UI — filters by actor,
 * action, entity type/id, business (via metadata), and date range. This
 * route only implements the Module 4 domain integration; it is not the
 * admin panel itself.
 */
import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { queryActivity } from "@/modules/activity/service";
import type { ActivityTargetType } from "@/modules/activity/types";

export const GET = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "activity:read");

  const url = new URL(req.url);
  const sp = url.searchParams;

  const result = await queryActivity({
    workspaceId: workspaceUser.workspaceId,
    actorId: sp.get("actorId") ?? undefined,
    action: sp.get("action") ?? undefined,
    targetType: (sp.get("targetType") as ActivityTargetType | null) ?? undefined,
    targetId: sp.get("targetId") ?? undefined,
    businessId: sp.get("businessId") ?? undefined,
    dateFrom: sp.get("dateFrom") ? new Date(sp.get("dateFrom")!) : undefined,
    dateTo: sp.get("dateTo") ? new Date(sp.get("dateTo")!) : undefined,
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
    pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
  });

  return apiSuccess(result);
});
