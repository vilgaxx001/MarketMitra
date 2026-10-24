/**
 * .../businesses/[businessId]/ai-memories — list (ai-memory:read) and create (ai-memory:create).
 * The business is re-verified against the caller's workspace in the service layer.
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { createBusinessMemorySchema, listBusinessMemoriesQuerySchema } from "@/modules/ai/memory/validators";
import { createBusinessMemory, listBusinessMemories } from "@/modules/ai/memory/service";
import { readBoundedJson } from "@/modules/ai/memory/http";

type Params = { workspaceSlug: string; businessId: string };

export const GET = withApiHandler<Params>(async (req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-memory:read");
  const query = listBusinessMemoriesQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) return apiValidationError(query.error);
  const { items, totalCount, limit, offset } = await listBusinessMemories(businessId, workspaceUser.workspaceId, query.data);
  return apiSuccess(items, { totalCount, limit, offset });
});

export const POST = withApiHandler<Params>(async (req, { params }) => {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai-memory:create");
  const body = await readBoundedJson(req);
  if (!body.ok) return body.response;
  const result = createBusinessMemorySchema.safeParse(body.data);
  if (!result.success) return apiValidationError(result.error);
  return apiSuccess(await createBusinessMemory(businessId, workspaceUser.workspaceId, workspaceUser.id, result.data), undefined, 201);
});
