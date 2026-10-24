import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { changeRoleSchema } from "@/modules/team/validators";
import { changeRole, removeMember } from "@/modules/team/service";

export const PATCH = withApiHandler<{ workspaceSlug: string; userId: string }>(async (req, { params }) => {
  const { workspaceSlug, userId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "team:change-role");

  const body = await req.json();
  const result = changeRoleSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  await changeRole(workspaceUser.workspaceId, userId, workspaceUser.id, result.data.role);
  return apiSuccess({ updated: true });
});

export const DELETE = withApiHandler<{ workspaceSlug: string; userId: string }>(async (_req, { params }) => {
  const { workspaceSlug, userId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "team:remove");

  await removeMember(workspaceUser.workspaceId, userId, workspaceUser.id);
  return apiSuccess({ removed: true });
});
