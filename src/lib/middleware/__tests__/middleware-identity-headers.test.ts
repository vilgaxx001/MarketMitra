/**
 * src/middleware.ts must delete client-supplied identity headers from EVERY request it forwards — no cookie, an invalid /
 * tampered / expired cookie, and a valid cookie — and must not inject any identity itself.
 *
 * Next.js encodes the downstream request headers of `NextResponse.next({ request: { headers } })` as response headers:
 * `x-middleware-override-headers` (the complete list of names the handler will see) and `x-middleware-request-<name>`
 * (their values). A header absent from that list is NOT delivered to the handler, so that is what is asserted.
 * REAL: the middleware, NextRequest/NextResponse and jose. DOUBLES: none.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { middleware } from "@/middleware";
import { IDENTITY_HEADERS, withoutIdentityHeaders } from "@/lib/middleware/identity-headers";

const SECRET_TEXT = process.env.SESSION_SECRET!;
const SECRET = new TextEncoder().encode(SECRET_TEXT);
const COOKIE = process.env.SESSION_COOKIE_NAME ?? "marketmitra_session";
const nowS = () => Math.floor(Date.now() / 1000);
const claims = { sessionId: "sess_1", userId: "user_1", email: "u@example.test", platformRole: "USER" };
const token = (c: object = claims, exp: number | string = "1h", key = SECRET) =>
  new SignJWT({ ...c }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(nowS() - 7200).setExpirationTime(exp).setIssuer("marketmitra").setAudience("marketmitra-app").sign(key);

const FORGED = { "x-user-id": "attacker-chosen", "x-session-id": "attacker-session", "x-user-email": "root@evil.test", "x-platform-role": "SUPER_ADMIN" };
const request = (path: string, cookie?: string, extra: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: { ...FORGED, "x-keep-me": "yes", ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}), ...extra } });

/** Names the downstream handler will receive (NextResponse.next request-header override list). */
const delivered = (res: Response) => (res.headers.get("x-middleware-override-headers") ?? "").split(",").filter(Boolean);
const expectStripped = (res: Response) => {
  const names = delivered(res);
  expect(res.headers.get("x-middleware-override-headers"), "middleware must forward an explicit header override list").not.toBeNull();
  for (const n of IDENTITY_HEADERS) {
    expect(names, `${n} must not reach the handler`).not.toContain(n);
    expect(res.headers.get(`x-middleware-request-${n}`), `${n} value must not be forwarded`).toBeNull();
  }
  expect(names).toContain("x-keep-me"); // unrelated headers are untouched
};

describe("middleware removes client-supplied identity headers on every path", () => {
  it("API route, NO cookie", async () => { expectStripped(await middleware(request("/api/v1/workspaces/alpha/businesses"))); });
  it("API route, garbage cookie", async () => { expectStripped(await middleware(request("/api/v1/auth/me", "not-a-jwt"))); });
  it("API route, tampered cookie", async () => { const t = await token(); expectStripped(await middleware(request("/api/v1/auth/me", t.slice(0, -6) + (t.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA")))); });
  it("API route, EXPIRED cookie", async () => { expectStripped(await middleware(request("/api/v1/auth/me", await token(claims, nowS() - 3600)))); });
  it("API route, cookie signed with the wrong secret", async () => { expectStripped(await middleware(request("/api/v1/auth/me", await token(claims, "1h", new TextEncoder().encode("a-different-secret-a-different-secret"))))); });
  it("API route, VALID cookie: forged values are removed and NO identity is injected in their place", async () => {
    const res = await middleware(request("/api/v1/auth/me", await token()));
    expectStripped(res);
    expect([...res.headers.keys()].filter((k) => k.startsWith("x-middleware-request-x-user") || k.startsWith("x-middleware-request-x-session") || k.startsWith("x-middleware-request-x-platform"))).toEqual([]);
  });
  it("public page, no cookie", async () => { expectStripped(await middleware(request("/pricing"))); });
  it("header names are case-insensitive: mixed-case forgeries are removed too", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/auth/me", { headers: { "X-User-Id": "a", "X-PLATFORM-ROLE": "SUPER_ADMIN", "X-Session-ID": "b", "x-User-Email": "c", "x-keep-me": "yes" } });
    expectStripped(await middleware(req));
  });
  it("protected page without a session still redirects to /login (existing behaviour preserved)", async () => {
    const res = await middleware(request("/alpha/dashboard"));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/login");
  });
  it("a signed JWT on /login is forwarded (not redirected): the live-session check moved to the (auth) layout, so a revoked token cannot loop", async () => {
    const res = await middleware(request("/login", await token()));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expectStripped(res);
  });
  it("/admin without SUPER_ADMIN in a valid JWT still redirects to /dashboard (coarse guard preserved)", async () => {
    const res = await middleware(request("/admin", await token()));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/dashboard");
  });
});

describe("withoutIdentityHeaders", () => {
  it("removes exactly the four identity headers, case-insensitively, and leaves the input untouched", () => {
    const src = new Headers({ "X-User-Id": "1", "x-session-id": "2", "X-USER-EMAIL": "3", "x-platform-role": "4", accept: "text/html" });
    const out = withoutIdentityHeaders(src);
    expect([...out.keys()]).toEqual(["accept"]);
    expect(src.get("x-user-id")).toBe("1");
  });
});
