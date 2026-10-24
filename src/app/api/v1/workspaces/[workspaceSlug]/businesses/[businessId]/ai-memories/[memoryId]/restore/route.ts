/**
 * .../ai-memories/[memoryId]/restore — POST (ai-memory:edit). Idempotent.
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { memoryIdSchema } from "@/modules/ai/memory/validators";
import { restoreBusinessMemory } from "@/modules/ai/memory/service";

export const POST = withApiHandler<{ workspaceSlug: string; businessId: string; memoryId: string }>(async (_req, { params }) => {
  const { workspaceSlug, businessId, memoryId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-memory:edit");
  const id = memoryIdSchema.safeParse(memoryId);
  if (!id.success) return apiValidationError(id.error);
  return apiSuccess(await restoreBusinessMemory(id.data, businessId, workspaceUser.workspaceId, workspaceUser.id));
});
