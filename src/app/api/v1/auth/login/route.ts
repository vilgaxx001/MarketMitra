/**
 * src/app/api/v1/auth/login/route.ts
 */
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { loginSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { setSessionCookie } from "@/modules/auth/session";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit, beginLoginAttempt } from "@/lib/rate-limit";

export const POST = withApiHandler(async (req) => {
  // Per-IP limit first, before a byte of the body is read: a flood costs one counter increment, not a parse.
  const ip = await enforceIpLimit(req, "login");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.auth);
  if (!parsedBody.ok) return parsedBody.response;
  const result = loginSchema.safeParse(parsedBody.data);
  if (!result.success) return apiValidationError(result.error);

  // Counts this attempt per account+IP and per account (unrecognised IPs) BEFORE the password is checked, so parallel guesses
  // cannot slip through; refuses with the same 429 whether or not the account exists.
  const attempt = await beginLoginAttempt(ip, result.data.email);
  const { user, sessionToken } = await authService.login(result.data, {
    userAgent: req.headers.get("user-agent") ?? undefined,
    // Only an address the deployment's trusted-proxy configuration vouches for; never the client's own x-forwarded-for.
    ipAddress: ip.address ?? undefined,
  });
  await attempt.succeeded();

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
