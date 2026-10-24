/**
 * src/app/api/v1/auth/me/route.ts
 *
 * Returns the currently authenticated user's profile. Used by the
 * client-side auth state hook to hydrate the user context after login.
 */
import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { requireAuthUser } from "@/lib/middleware/require-auth";

export const GET = withApiHandler(async () => {
  const user = await requireAuthUser();
  return apiSuccess({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    platformRole: user.platformRole,
    emailVerified: !!user.emailVerifiedAt,
  });
});
