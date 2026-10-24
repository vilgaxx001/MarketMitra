import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { getOnboardingState } from "@/modules/onboarding/service";

export const GET = withApiHandler<{ workspaceSlug: string }>(async (_req, { params }) => {
  const { workspaceSlug } = await params;
  await requireWorkspaceAccess(workspaceSlug); // any member may resume/view onboarding progress

  const state = await getOnboardingState(workspaceSlug);
  return apiSuccess(state);
});
