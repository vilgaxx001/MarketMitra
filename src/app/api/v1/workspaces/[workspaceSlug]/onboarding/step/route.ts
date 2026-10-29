import { z } from "zod";
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { saveStep } from "@/modules/onboarding/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

const bodySchema = z.object({ step: z.number().int().min(2).max(8), data: z.unknown() });

export const POST = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "business:edit");

  const parsedBody = await readBoundedJson(req, BODY_LIMITS.profile);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = bodySchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const outcome = await saveStep(workspaceUser.workspaceId, workspaceUser.id, result.data.step, result.data.data);
  return apiSuccess(outcome);
});
