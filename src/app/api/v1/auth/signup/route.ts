/**
 * src/app/api/v1/auth/signup/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { signupSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { setSessionCookie } from "@/modules/auth/session";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit, enforceEmailLimit } from "@/lib/rate-limit";

export const POST = withApiHandler(async (req) => {
  await enforceIpLimit(req, "signup");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.auth);
  if (!parsedBody.ok) return parsedBody.response;
  const result = signupSchema.safeParse(parsedBody.data);
  if (!result.success) return apiValidationError(result.error);
  await enforceEmailLimit("signup", result.data.email);

  const { user, sessionToken } = await authService.signup(result.data);
  await setSessionCookie(sessionToken);

  return apiSuccess(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: !!user.emailVerifiedAt,
      },
    },
    undefined,
    201
  );
});
