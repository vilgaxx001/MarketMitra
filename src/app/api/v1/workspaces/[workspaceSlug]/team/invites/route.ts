import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { getWorkspaceBySlug } from "@/modules/workspace/service";
import { inviteMemberSchema } from "@/modules/team/validators";
import { inviteMember, listPendingInvites } from "@/modules/team/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

export const GET = withApiHandler<{ workspaceSlug: string }>(async (_req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "team:view");

  const invites = await listPendingInvites(workspaceUser.workspaceId);
  return apiSuccess(invites);
});

export const POST = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "team:invite");

  const parsedBody = await readBoundedJson(req, BODY_LIMITS.control);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const result = inviteMemberSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const workspace = await getWorkspaceBySlug(workspaceSlug);
  const invite = await inviteMember(workspaceUser.workspaceId, workspace.name, workspaceUser.id, workspaceUser.name, result.data);
  return apiSuccess(invite);
});
