/**
 * src/app/api/v1/auth/signup/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { signupSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { setSessionCookie } from "@/modules/auth/session";

export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const result = signupSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

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
