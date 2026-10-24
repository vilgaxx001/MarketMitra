import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { z } from "zod";
import { initiateUploadSchema } from "@/modules/assets/validators";
import { initiateUpload } from "@/modules/assets/service";

const schema = initiateUploadSchema.extend({ sha256Hash: z.string().length(64) });

export const POST = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "asset:create");

  const body = await req.json();
  const result = schema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const outcome = await initiateUpload(workspaceUser.workspaceId, result.data);
  return apiSuccess(outcome);
});
