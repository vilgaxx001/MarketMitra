/**
 * .../ai-memories/[memoryId] — get (read), update (edit), hard delete (delete).
 * A malformed memoryId is rejected before any lookup; a missing or
 * other-business memoryId returns the same NOT_FOUND.
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { memoryIdSchema, updateBusinessMemorySchema } from "@/modules/ai/memory/validators";
import { readBoundedJson } from "@/modules/ai/memory/http";
import { getBusinessMemory, updateBusinessMemory, deleteBusinessMemory } from "@/modules/ai/memory/service";

type Params = { workspaceSlug: string; businessId: string; memoryId: string };

export const GET = withApiHandler<Params>(async (_req, { params }) => {
  const { workspaceSlug, businessId, memoryId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-memory:read");
  const id = memoryIdSchema.safeParse(memoryId);
  if (!id.success) return apiValidationError(id.error);
  return apiSuccess(await getBusinessMemory(id.data, businessId, workspaceUser.workspaceId));
});

export const PATCH = withApiHandler<Params>(async (req, { params }) => {
  const { workspaceSlug, businessId, memoryId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-memory:edit");
  const id = memoryIdSchema.safeParse(memoryId);
  if (!id.success) return apiValidationError(id.error);
  const body = await readBoundedJson(req);
  if (!body.ok) return body.response;
  const result = updateBusinessMemorySchema.safeParse(body.data);
  if (!result.success) return apiValidationError(result.error);
  return apiSuccess(await updateBusinessMemory(id.data, businessId, workspaceUser.workspaceId, workspaceUser.id, result.data));
});

export const DELETE = withApiHandler<Params>(async (_req, { params }) => {
  const { workspaceSlug, businessId, memoryId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-memory:delete");
  const id = memoryIdSchema.safeParse(memoryId);
  if (!id.success) return apiValidationError(id.error);
  await deleteBusinessMemory(id.data, businessId, workspaceUser.workspaceId, workspaceUser.id);
  return apiSuccess({ deleted: true });
});
