/**
 * src/app/api/v1/auth/signup/route.ts
 *
 * Account-enumeration-safe signup. Every valid request gets the SAME answer, whether or not the address is already registered:
 * HTTP 202, the same body, and NO session cookie (a Set-Cookie would itself reveal a new account). The account is created, or
 * the existing owner is notified, after the response (see authService.registerAccount). The user signs in through the normal,
 * enumeration-safe login once their account exists; e-mail verification stays a soft flag exactly as before.
 *
 * Remaining, deliberately visible differences are not about the address: validation errors (400, from what the caller sent),
 * rate limits (429, keyed on what was submitted, identical for new and existing addresses) and the platform-wide signup switch (403).
 */
import { after } from "next/server";
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { signupSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit, enforceEmailLimit } from "@/lib/rate-limit";

const SIGNUP_ACCEPTED_MESSAGE =
  "Check your email. If this address can be registered, we have sent instructions to it. If you already have an account, log in instead.";

export const POST = withApiHandler(async (req) => {
  await enforceIpLimit(req, "signup");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.auth);
  if (!parsedBody.ok) return parsedBody.response;
  const result = signupSchema.safeParse(parsedBody.data);
  if (!result.success) return apiValidationError(result.error);
  authService.assertSignupsEnabled();
  await enforceEmailLimit("signup", result.data.email);

  const input = result.data;
  after(async () => {
    try {
      await authService.registerAccount(input);
    } catch (err) {
      // Name only: database and provider errors can contain the address.
      logger.error({ msg: "signup_registration_failed", errorName: err instanceof Error ? err.name : "unknown" });
    }
  });

  return apiSuccess({ status: "check_your_email", message: SIGNUP_ACCEPTED_MESSAGE }, undefined, 202);
});
