/**
 * src/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-preferences/route.ts
 *
 * Business AI Preferences (Module 5B.1). Reads need `ai-preferences:read`;
 * writes and reset need `ai-preferences:edit`. The business is always
 * re-verified against the caller's workspace in the service layer.
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { readBoundedJson } from "@/lib/bounded-json";
import { requirePermission } from "@/modules/rbac";
import { updateBusinessAIPreferencesSchema } from "@/modules/ai/preferences/validators";
import { getBusinessAIPreferences, updateBusinessAIPreferences, resetBusinessAIPreferences } from "@/modules/ai/preferences/service";

type Params = { workspaceSlug: string; businessId: string };

// Largest legitimate body: 1,000 + 10x200 characters (<= 4 bytes each) plus JSON syntax is about 12 KB. Counted in bytes while reading.
const MAX_PREFERENCES_BODY_BYTES = 32_768;

export const GET = withApiHandler<Params>(async (_req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-preferences:read");
  return apiSuccess(await getBusinessAIPreferences(businessId, workspaceUser.workspaceId));
});

export const PATCH = withApiHandler<Params>(async (req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-preferences:edit");
  const body = await readBoundedJson(req, MAX_PREFERENCES_BODY_BYTES);
  if (!body.ok) return body.response;
  const result = updateBusinessAIPreferencesSchema.safeParse(body.data);
  if (!result.success) return apiValidationError(result.error);
  return apiSuccess(await updateBusinessAIPreferences(businessId, workspaceUser.workspaceId, workspaceUser.id, result.data));
});

export const DELETE = withApiHandler<Params>(async (_req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-preferences:edit");
  return apiSuccess(await resetBusinessAIPreferences(businessId, workspaceUser.workspaceId, workspaceUser.id));
});
