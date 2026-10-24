import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { completeOnboarding } from "@/modules/onboarding/service";

export const POST = withApiHandler<{ workspaceSlug: string }>(async (_req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "workspace:edit");

  await completeOnboarding(workspaceUser.workspaceId, workspaceUser.id);
  return apiSuccess({ completed: true });
});
