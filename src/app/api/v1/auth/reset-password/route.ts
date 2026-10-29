/**
 * src/app/api/v1/auth/reset-password/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { resetPasswordSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { clearSessionCookie } from "@/modules/auth/session";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit } from "@/lib/rate-limit";

export const POST = withApiHandler(async (req) => {
  await enforceIpLimit(req, "resetPassword");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.auth);
  if (!parsedBody.ok) return parsedBody.response;
  const result = resetPasswordSchema.safeParse(parsedBody.data);
  if (!result.success) return apiValidationError(result.error);

  await authService.resetPassword(result.data.token, result.data.password);

  // Clear any existing session — user must log in again with new password
  await clearSessionCookie();

  return apiSuccess({ reset: true });
});
