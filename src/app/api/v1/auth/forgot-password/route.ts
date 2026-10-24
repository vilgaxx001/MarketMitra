/**
 * src/app/api/v1/auth/forgot-password/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { forgotPasswordSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";

export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const result = forgotPasswordSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  // Always returns the same success response regardless of whether the
  // email exists — prevents email enumeration via this endpoint.
  await authService.requestPasswordReset(result.data.email);

  return apiSuccess({
    message: "If an account exists for this email, a reset link has been sent.",
  });
});
