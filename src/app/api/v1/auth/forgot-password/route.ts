/**
 * src/app/api/v1/auth/forgot-password/route.ts
 */
import { after } from "next/server";
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { forgotPasswordSchema } from "@/modules/auth/validators";
import * as authService from "@/modules/auth/service";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit, allowEmail } from "@/lib/rate-limit";

export const POST = withApiHandler(async (req) => {
  await enforceIpLimit(req, "forgotPassword");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.auth);
  if (!parsedBody.ok) return parsedBody.response;
  const result = forgotPasswordSchema.safeParse(parsedBody.data);
  if (!result.success) return apiValidationError(result.error);
  const email = result.data.email;

  // Always returns the same success response regardless of whether the
  // email exists — prevents email enumeration via this endpoint.
  //
  // Over the per-address limit: answer exactly as for a normal request (same 200, same body) but send nothing. A 429 here
  // would reveal that the address was asked about recently; staying silent also stops mail-bombing one inbox.
  if (await allowEmail("forgotPassword", email)) {
    // The token insert and the e-mail send run AFTER the response is sent. Done inline, an existing account took a database
    // write plus a provider round trip, and a provider outage turned into a 500 for existing accounts only, while an unknown
    // address returned instantly: a timing and error oracle for account existence. Now every address gets the same fast 200.
    after(async () => {
      try {
        await authService.requestPasswordReset(email);
      } catch (err) {
        // Name only: provider error messages can contain the recipient address.
        logger.error({ msg: "password_reset_request_failed", errorName: err instanceof Error ? err.name : "unknown" });
      }
    });
  }

  return apiSuccess({
    message: "If an account exists for this email, a reset link has been sent.",
  });
});
