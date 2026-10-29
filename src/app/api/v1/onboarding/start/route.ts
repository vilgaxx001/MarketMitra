/**
 * src/app/api/v1/onboarding/start/route.ts
 *
 * Step 1 of onboarding — creates the workspace itself. Not scoped to an
 * existing [workspaceSlug] because, at this point, none exists yet.
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireAuth } from "@/lib/middleware/require-auth";
import { step1Schema } from "@/modules/onboarding/validators";
import { createWorkspace } from "@/modules/workspace/service";
import { advanceStep } from "@/modules/onboarding/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

export const POST = withApiHandler(async (req) => {
  const session = await requireAuth();
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.profile);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = step1Schema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const workspace = await createWorkspace(session.userId, result.data);
  await advanceStep(workspace.id, 1);

  return apiSuccess(workspace);
});
