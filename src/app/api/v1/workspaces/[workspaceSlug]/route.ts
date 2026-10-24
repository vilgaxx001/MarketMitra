/**
 * src/app/api/v1/workspaces/[workspaceSlug]/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { updateWorkspaceSchema } from "@/modules/workspace/validators";
import { getWorkspaceBySlug, updateWorkspace } from "@/modules/workspace/service";

export const GET = withApiHandler<{ workspaceSlug: string }>(async (_req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "workspace:read");

  const workspace = await getWorkspaceBySlug(workspaceSlug);
  return apiSuccess(workspace);
});

export const PATCH = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "workspace:edit");

  const body = await req.json();
  const result = updateWorkspaceSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const workspace = await updateWorkspace(workspaceUser.workspaceId, workspaceUser.id, result.data);
  return apiSuccess(workspace);
});
