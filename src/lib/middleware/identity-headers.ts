/**
 * src/lib/middleware/identity-headers.ts
 *
 * The request headers an earlier design used to carry the authenticated identity from middleware to handlers.
 * They are forgeable by any client, so NO code may read them as identity (requireAuth() verifies the session cookie
 * and the database instead) and middleware removes them from every request it forwards.
 *
 * Edge-safe: no Node-only imports (imported by src/middleware.ts).
 */
export const IDENTITY_HEADERS = ["x-user-id", "x-session-id", "x-user-email", "x-platform-role"] as const;

/** A copy of `source` with every identity header removed (header names are case-insensitive in `Headers`). */
export function withoutIdentityHeaders(source: Headers): Headers {
  const copy = new Headers(source);
  for (const name of IDENTITY_HEADERS) copy.delete(name);
  return copy;
}
