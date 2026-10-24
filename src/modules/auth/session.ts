/**
 * src/modules/auth/session.ts
 *
 * Session management using signed JWTs stored in HttpOnly cookies.
 *
 * WHY JWT + HttpOnly cookie (not a server-side session store):
 *   - HttpOnly: JavaScript on the page cannot read the token, preventing
 *     XSS token theft — even if an attacker injects a script.
 *   - Signed JWT: the server verifies the signature on every request
 *     without a database lookup, keeping auth fast.
 *   - Trade-off acknowledged: a JWT alone cannot be revoked before expiry. So the JWT is only the FIRST gate: requireAuth()
 *     (src/lib/middleware/require-auth.ts) additionally requires the matching row in the Session table (logout, password
 *     change and reset delete it) and an active user, on EVERY authenticated request, and takes the user's role and
 *     email from the database rather than from the token claims.
 *
 * SECURITY DECISIONS documented explicitly:
 *   - Tokens are signed with HS256 (HMAC-SHA256) using SESSION_SECRET.
 *     SESSION_SECRET must be ≥32 chars (enforced by env.ts at boot).
 *   - Cookie is Secure in production, SameSite=Lax (allows first-party
 *     navigation, blocks CSRF from third-party sites).
 *   - The raw token is never logged — only its session ID (which can be
 *     revoked) appears in audit logs.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { SessionPayload } from "@/modules/auth/types";

const SECRET = new TextEncoder().encode(env.SESSION_SECRET);
const ALGORITHM = "HS256";

/* -------------------------------------------------------------------------
 * Token creation
 * ---------------------------------------------------------------------- */

export async function createSessionToken(payload: Omit<SessionPayload, "exp">): Promise<string> {
  return new SignJWT({ ...(payload as unknown as JWTPayload) })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_MAX_AGE_DAYS}d`)
    .setIssuer("marketmitra")
    .setAudience("marketmitra-app")
    .sign(SECRET);
}

/* -------------------------------------------------------------------------
 * Token verification
 * ---------------------------------------------------------------------- */

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      issuer: "marketmitra",
      audience: "marketmitra-app",
      algorithms: [ALGORITHM],
    });
    return payload as unknown as SessionPayload;
  } catch (err) {
    // Expected for expired or tampered tokens — log at debug, not warn/error
    logger.debug({ msg: "Session token verification failed", err });
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Cookie helpers
 * ---------------------------------------------------------------------- */

const COOKIE_OPTIONS = {
  name: env.SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60, // seconds
};

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_OPTIONS.name, token, COOKIE_OPTIONS);
}

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_OPTIONS.name)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_OPTIONS.name);
}

/* -------------------------------------------------------------------------
 * Get current session — used in Server Components and API routes.
 * Returns null if no valid session exists (not logged in or token
 * expired/tampered). Never throws.
 * ---------------------------------------------------------------------- */

/**
 * NOT AN AUTHORIZATION CHECK: this verifies only the JWT (signature/expiry). It does not consult the session row or the
 * user, so its `platformRole` can be stale and the token may have been revoked. Use it for cosmetic decisions (marketing
 * CTAs) and for logout. Anything that gates data or actions must use requireAuth() (src/lib/middleware/require-auth.ts).
 */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const token = await getSessionCookie();
  if (!token) return null;
  return verifySessionToken(token);
}
