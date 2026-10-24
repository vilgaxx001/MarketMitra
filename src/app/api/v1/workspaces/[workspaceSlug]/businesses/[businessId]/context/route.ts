/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/context/route.ts
 *
 * Resolves the Business Context Engine output for one business. This is
 * the concrete HTTP entry point Module 5 (or an internal debug view)
 * calls to get the full BusinessContext contract — see
 * src/types/business-context.ts and src/modules/context/service.ts.
 */
import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { resolveBusinessContext } from "@/modules/context/service";

export const GET = withApiHandler<{ workspaceSlug: string; businessId: string }>(async (_req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:read");

  const context = await resolveBusinessContext(workspaceUser, businessId);
  return apiSuccess(context);
});
