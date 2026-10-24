/**
 * src/app/api/v1/auth/logout/route.ts
 */
import { withApiHandler, apiSuccess } from "@/lib/api-response";
import { getCurrentSession, clearSessionCookie } from "@/modules/auth/session";
import * as authService from "@/modules/auth/service";
import { redirect } from "next/navigation";

export const POST = withApiHandler(async () => {
  const session = await getCurrentSession();
  if (session) {
    await authService.logout(session.sessionId);
  }
  await clearSessionCookie();
  return apiSuccess({ loggedOut: true });
});

// GET allows a plain link/redirect to trigger logout (used by the
// profile dropdown "Log out" menu item which is a Next.js Link).
export const GET = withApiHandler(async () => {
  const session = await getCurrentSession();
  if (session) {
    await authService.logout(session.sessionId);
  }
  await clearSessionCookie();
  redirect("/login");
});
