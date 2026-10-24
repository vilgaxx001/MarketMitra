/**
 * src/app/api/v1/auth/verify-email/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { verifyEmailSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";

export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const result = verifyEmailSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  await authService.verifyEmail(result.data.token);
  return apiSuccess({ verified: true });
});
