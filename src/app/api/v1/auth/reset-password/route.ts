/**
 * src/app/api/v1/auth/reset-password/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { resetPasswordSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { clearSessionCookie } from "@/modules/auth/session";

export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const result = resetPasswordSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  await authService.resetPassword(result.data.token, result.data.password);

  // Clear any existing session — user must log in again with new password
  await clearSessionCookie();

  return apiSuccess({ reset: true });
});
