/**
 * src/app/api/v1/auth/resend-verification/route.ts
 *
 * POST — resends the email verification link for the currently
 * authenticated (but unverified) user. Rate-limited to prevent abuse.
 */
import { withApiHandler, apiSuccess, ApiException } from "@/lib/api-response";
import { requireAuth } from "@/lib/middleware/require-auth";
import * as authService from "@/modules/auth/service";
import * as authRepo from "@/modules/auth/repository";

export const POST = withApiHandler(async () => {
  const session = await requireAuth(); // verified JWT AND a live server-side session (a token revoked by logout/password change is refused)

  const user = await authRepo.findUserById(session.userId);
  if (!user) {
    throw new ApiException("NOT_FOUND", "User not found.");
  }

  if (user.emailVerifiedAt) {
    throw new ApiException("CONFLICT", "Your email address is already verified.");
  }

  await authService.sendVerificationEmail(user.id, user.email, user.name);

  return apiSuccess({ sent: true });
});
