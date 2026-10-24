/**
 * src/app/api/v1/invites/accept/route.ts
 *
 * Not workspace-scoped by slug — the visitor arrives from an email link
 * (`/invite/{token}`) that doesn't necessarily know the workspace slug.
 * Requires an authenticated session; acceptInvite() itself verifies the
 * session's email matches the invite exactly before creating membership.
 */
import { z } from "zod";
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireAuth } from "@/lib/middleware/require-auth";
import { acceptInvite } from "@/modules/team/service";

const acceptSchema = z.object({ token: z.string().min(1) });

export const POST = withApiHandler(async (req) => {
  const session = await requireAuth();
  const body = await req.json();
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const result = await acceptInvite(parsed.data.token, session.userId, session.email);
  return apiSuccess(result);
});
