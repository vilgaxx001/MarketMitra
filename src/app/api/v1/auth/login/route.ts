/**
 * src/app/api/v1/auth/login/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { loginSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { setSessionCookie } from "@/modules/auth/session";
import { headers } from "next/headers";

export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const result = loginSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const headersList = await headers();
  const { user, sessionToken } = await authService.login(result.data, {
    userAgent: headersList.get("user-agent") ?? undefined,
    ipAddress: headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });

  await setSessionCookie(sessionToken);

  return apiSuccess({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      emailVerified: !!user.emailVerifiedAt,
    },
  });
});
