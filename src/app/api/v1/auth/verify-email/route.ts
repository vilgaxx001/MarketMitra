/**
 * src/app/api/v1/auth/verify-email/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { verifyEmailSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit } from "@/lib/rate-limit";

export const POST = withApiHandler(async (req) => {
  await enforceIpLimit(req, "verifyEmail");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.auth);
  if (!parsedBody.ok) return parsedBody.response;
  const result = verifyEmailSchema.safeParse(parsedBody.data);
  if (!result.success) return apiValidationError(result.error);

  await authService.verifyEmail(result.data.token);
  return apiSuccess({ verified: true });
});
