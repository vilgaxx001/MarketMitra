/**
 * src/app/api/v1/workspaces/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireAuth } from "@/lib/middleware/require-auth";
import { createWorkspaceSchema } from "@/modules/workspace/validators";
import { createWorkspace, listUserWorkspaces } from "@/modules/workspace/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

export const POST = withApiHandler(async (req) => {
  const session = await requireAuth();
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.control);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = createWorkspaceSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const workspace = await createWorkspace(session.userId, result.data);
  return apiSuccess(workspace);
});

export const GET = withApiHandler(async () => {
  const session = await requireAuth();
  const workspaces = await listUserWorkspaces(session.userId);
  return apiSuccess(workspaces);
});
