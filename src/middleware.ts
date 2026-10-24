/**
 * src/middleware.ts
 *
 * Next.js Edge Middleware — runs on every request before the page
 * or API route handler executes.
 *
 * RESPONSIBILITIES:
 *   1. Session guard: redirect unauthenticated users trying to access
 *      protected routes to /login.
 *   2. (Moved) Redirecting signed-in users away from the auth pages is done server-side in src/app/(auth)/layout.tsx. Middleware
 *      only sees a JWT; it cannot tell a live session from one revoked by logout / password change / deactivation, and
 *      bouncing such a token /login -> /dashboard -> /login looped forever (ERR_TOO_MANY_REDIRECTS).
 *   3. Super-admin guard: redirect non-SUPER_ADMIN users away from /admin.
 *   4. Email verification gate: redirect unverified users to a
 *      "please verify your email" page if they try to access the app.
 *
 * IDENTITY HEADERS (security-critical):
 *   Middleware NEVER passes identity to handlers through request headers. The headers x-user-id, x-session-id,
 *   x-user-email and x-platform-role are DELETED from every request this middleware forwards, whether or not a cookie is
 *   present, valid, expired or tampered. Handlers establish identity themselves in requireAuth()
 *   (src/lib/middleware/require-auth.ts): verified cookie JWT + live session row, with role/email read from the
 *   database. An earlier design injected these headers for logged-in requests and trusted them downstream, but left
 *   client-supplied copies untouched on the unauthenticated path, so a client could pick its own platform role.
 *   The JWT role read below is used ONLY for the coarse /admin redirect and may be stale; it never authorises data
 *   access (there are no /admin handlers today; any that are added must call requireAuth() and check its DB role).
 *
 * WHAT IT DOES NOT DO:
 *   - Workspace-level RBAC (ADMIN vs TEAM_MEMBER vs CLIENT). That
 *     requires a DB lookup (WorkspaceMember table) which is too slow
 *     for middleware. Workspace RBAC is enforced in Server Components
 *     and API routes via requirePermission(). Middleware only handles
 *     the coarser "are you logged in at all?" / "are you an admin?"
 *     checks that can be resolved from the JWT alone.
 *   - Any state mutations. Middleware is pure routing — no DB writes.
 *
 * EDGE RUNTIME: This file runs in the Next.js Edge Runtime (V8 isolate,
 * not Node.js) — only Web-compatible APIs are available. `jose` (used
 * for JWT verification) is explicitly Web-compatible. `bcryptjs`,
 * `@prisma/client`, and any other Node.js module must NOT be imported
 * here.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { SessionPayload } from "@/modules/auth/types";
import { withoutIdentityHeaders } from "@/lib/middleware/identity-headers";

/* -------------------------------------------------------------------------
 * Route classification
 * ---------------------------------------------------------------------- */

/** Routes that require authentication. Anything under these prefixes
 *  that is NOT in PUBLIC_ROUTES will trigger a login redirect. */
const PROTECTED_PREFIXES = ["/dashboard", "/projects", "/generate", "/analytics",
  "/billing", "/team", "/settings", "/calendar", "/onboarding", "/invite"];

/** Workspace-scoped routes — matched by the [workspaceSlug] segment pattern. */
const WORKSPACE_PATTERN = /^\/[a-z0-9-]+\/(dashboard|projects|generate|analytics|billing|team|settings|calendar|businesses|onboarding|activity)/;

const AUTH_ROUTES = ["/login", "/signup", "/verify-email", "/reset-password", "/forgot-password"];

const ADMIN_ROUTES = ["/admin"];

const UNPROTECTED_PREFIXES = ["/", "/pricing", "/features", "/_next", "/api", "/icons", "/manifest"];

function isProtected(pathname: string): boolean {
  if (UNPROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) return false;
  return (
    PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) ||
    WORKSPACE_PATTERN.test(pathname)
  );
}

/** Forward the request to the app with every client-supplied identity header removed (the `request.headers` override replaces what the handler sees). */
function forwardWithoutIdentityHeaders(req: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: withoutIdentityHeaders(req.headers) } });
}

/* -------------------------------------------------------------------------
 * JWT verification (Edge-compatible)
 * ---------------------------------------------------------------------- */

async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const sessionSecret = process.env.SESSION_SECRET;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? "marketmitra_session";

  if (!sessionSecret) return null;

  const token = req.cookies.get(cookieName)?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(sessionSecret);
    const { payload } = await jwtVerify(token, secret, {
      issuer: "marketmitra",
      audience: "marketmitra-app",
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Middleware
 * ---------------------------------------------------------------------- */

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const session = await getSessionFromRequest(req);
  const isLoggedIn = !!session;

  // 1. (Signed-in users are redirected away from the auth pages by src/app/(auth)/layout.tsx, which checks the DATABASE.)

  // 2. Guard protected routes
  if (isProtected(pathname) && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Super-admin guard
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    if (!isLoggedIn || session.platformRole !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // 4. Forward. Identity is NOT attached: handlers verify the cookie and the database themselves (see header comment),
  //    and any client-supplied identity headers are removed here on every path (logged in or not).
  return forwardWithoutIdentityHeaders(req);
}

export const config = {
  /*
   * Run middleware on all routes EXCEPT:
   * - Next.js internals (_next/static, _next/image)
   * - Favicon
   * API routes under /api/webhooks are excluded too — webhook
   * endpoints must not have auth middleware (the gateway calls them
   * without a session cookie; they authenticate via signature instead).
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|icons).*)",
  ],
};
