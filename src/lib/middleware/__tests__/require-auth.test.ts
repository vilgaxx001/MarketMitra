/**
 * requireAuth / requireWorkspaceAccess — identity must come ONLY from the verified session cookie + the database.
 *
 * Regression for the critical header-trust vulnerability: middleware used to inject x-user-id / x-session-id /
 * x-user-email / x-platform-role and requireAuth trusted them, but a client could send the same headers itself on any
 * request middleware did not overwrite (no cookie, invalid / expired / tampered cookie) and pick its own platform role
 * (SUPER_ADMIN), crossing every tenant boundary. Here the forged headers are present on every attack case and
 * `headers()` is a spy that must never be called.
 *
 * REAL: jose signature/expiry/issuer/audience/algorithm verification (src/modules/auth/session.ts), the auth service and
 * repository queries, requireAuth / requireWorkspaceAccess.
 * DOUBLES: next/headers (cookie jar + a headers() spy), next/navigation, and Prisma `db` (an in-memory stand-in whose
 * queries are asserted). The same behaviour over real HTTP + PostgreSQL is in scripts/http-verification.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT, UnsecuredJWT } from "jose";

const h = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  headersSpy: vi.fn(),
  sessionRow: null as null | { id: string; user: { id: string; email: string; platformRole: string } },
  membership: null as null | Record<string, unknown>,
  workspace: null as null | Record<string, unknown>,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (h.cookie === undefined ? undefined : { value: h.cookie }), set: vi.fn(), delete: vi.fn() }),
  headers: async () => { h.headersSpy(); return { get: (k: string) => ({ "x-user-id": "forged-user", "x-session-id": "forged-session", "x-user-email": "forged@evil.test", "x-platform-role": "SUPER_ADMIN" } as Record<string, string>)[k] ?? null }; },
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
const db = vi.hoisted(() => ({
  session: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  workspace: { findUnique: vi.fn() },
  workspaceMember: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { requireAuth, requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { createSessionToken } from "@/modules/auth/session";

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);
const CLAIMS = { sessionId: "sess_1", userId: "user_1", email: "jwt@example.test", platformRole: "USER" as const };
const nowS = () => Math.floor(Date.now() / 1000);
const sign = (claims: object, key = SECRET, exp: number | string = "1h", extra: { iss?: string; aud?: string } = {}) =>
  new SignJWT({ ...claims }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(nowS() - 7200).setExpirationTime(exp)
    .setIssuer(extra.iss ?? "marketmitra").setAudience(extra.aud ?? "marketmitra-app").sign(key);
const dbRow = (role: string, email = "db@example.test") => ({ id: "sess_1", user: { id: "user_1", email, platformRole: role } });

beforeEach(() => {
  h.cookie = undefined; h.headersSpy.mockClear();
  db.session.findFirst.mockReset(); db.user.findUnique.mockReset(); db.workspace.findUnique.mockReset(); db.workspaceMember.findFirst.mockReset();
  db.session.findFirst.mockResolvedValue(dbRow("USER"));
});

describe("requireAuth — forged identity headers never become identity", () => {
  it("no cookie + forged SUPER_ADMIN headers -> UNAUTHENTICATED; headers() is never read and the DB is never queried", async () => {
    await expect(requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(h.headersSpy).not.toHaveBeenCalled();
    expect(db.session.findFirst).not.toHaveBeenCalled();
  });

  const bad: Array<[string, () => Promise<string>]> = [
    ["garbage (not a JWT)", async () => "not-a-jwt"],
    ["tampered signature", async () => { const t = await createSessionToken(CLAIMS); return t.slice(0, -6) + (t.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA"); }],
    ["payload swapped to SUPER_ADMIN with the original signature", async () => { const [hd, , sg] = (await createSessionToken(CLAIMS)).split("."); return `${hd}.${Buffer.from(JSON.stringify({ ...CLAIMS, platformRole: "SUPER_ADMIN", iss: "marketmitra", aud: "marketmitra-app", exp: nowS() + 3600 })).toString("base64url")}.${sg}`; }],
    ["expired (correctly signed)", async () => sign(CLAIMS, SECRET, nowS() - 3600)],
    ["signed with a different secret", async () => sign({ ...CLAIMS, platformRole: "SUPER_ADMIN" }, new TextEncoder().encode("another-secret-another-secret-123456"))],
    ["alg=none (unsigned)", async () => new UnsecuredJWT({ ...CLAIMS, platformRole: "SUPER_ADMIN" }).setIssuedAt().setExpirationTime("1h").setIssuer("marketmitra").setAudience("marketmitra-app").encode()],
    ["wrong issuer", async () => sign(CLAIMS, SECRET, "1h", { iss: "someone-else" })],
    ["wrong audience", async () => sign(CLAIMS, SECRET, "1h", { aud: "another-app" })],
    ["valid signature but missing sessionId", async () => sign({ userId: "user_1", email: "x@y.z", platformRole: "SUPER_ADMIN" })],
  ];
  for (const [name, make] of bad) {
    it(`${name} cookie + forged headers -> UNAUTHENTICATED without touching the DB or headers()`, async () => {
      h.cookie = await make();
      await expect(requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(db.session.findFirst).not.toHaveBeenCalled();
      expect(h.headersSpy).not.toHaveBeenCalled();
    });
  }
});

describe("requireAuth — the database is the authority", () => {
  it("valid cookie + live session -> returns the DB's role and email, not the JWT claims", async () => {
    h.cookie = await createSessionToken({ ...CLAIMS, platformRole: "SUPER_ADMIN" }); // stale/forged claim says SUPER_ADMIN
    db.session.findFirst.mockResolvedValue(dbRow("USER", "db@example.test"));
    await expect(requireAuth()).resolves.toMatchObject({ userId: "user_1", sessionId: "sess_1", email: "db@example.test", platformRole: "USER" });
  });
  it("a legitimate SUPER_ADMIN (DB says SUPER_ADMIN) keeps that role even if the JWT says USER", async () => {
    h.cookie = await createSessionToken(CLAIMS);
    db.session.findFirst.mockResolvedValue(dbRow("SUPER_ADMIN"));
    await expect(requireAuth()).resolves.toMatchObject({ platformRole: "SUPER_ADMIN" });
  });
  it("looks up the pair taken from the VERIFIED cookie (never from a header) and never reads headers()", async () => {
    h.cookie = await createSessionToken(CLAIMS);
    await requireAuth();
    const where = db.session.findFirst.mock.calls[0]![0].where;
    expect(where).toMatchObject({ id: "sess_1", userId: "user_1", user: { isActive: true } });
    expect(h.headersSpy).not.toHaveBeenCalled();
  });
  it("session row deleted / expired / user deactivated (lookup returns null) -> UNAUTHENTICATED", async () => {
    h.cookie = await createSessionToken(CLAIMS);
    db.session.findFirst.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("requireWorkspaceAccess — SUPER_ADMIN bypass depends on the DB role only", () => {
  const workspace = { id: "ws_1" };
  const saSelf = { id: "user_1", email: "db@example.test", name: "Platform Admin", avatarUrl: null, emailVerifiedAt: null };
  it("JWT says SUPER_ADMIN but DB says USER, and there is no membership -> FORBIDDEN; the workspace is never read through the bypass", async () => {
    h.cookie = await createSessionToken({ ...CLAIMS, platformRole: "SUPER_ADMIN" });
    db.session.findFirst.mockResolvedValue(dbRow("USER"));
    db.workspaceMember.findFirst.mockResolvedValue(null);
    await expect(requireWorkspaceAccess("alpha")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.workspace.findUnique).not.toHaveBeenCalled();
    expect(db.workspaceMember.findFirst.mock.calls[0]![0].where).toMatchObject({ userId: "user_1" });
  });
  it("forged headers + no cookie -> UNAUTHENTICATED before any workspace lookup", async () => {
    await expect(requireWorkspaceAccess("alpha")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(db.workspace.findUnique).not.toHaveBeenCalled();
    expect(db.workspaceMember.findFirst).not.toHaveBeenCalled();
  });
  it("DB says SUPER_ADMIN -> cross-workspace access without membership is preserved", async () => {
    h.cookie = await createSessionToken(CLAIMS);
    db.session.findFirst.mockResolvedValue(dbRow("SUPER_ADMIN"));
    db.workspace.findUnique.mockResolvedValue(workspace);
    db.user.findUnique.mockResolvedValue(saSelf);
    await expect(requireWorkspaceAccess("alpha")).resolves.toMatchObject({ workspaceId: "ws_1", workspaceRole: "ADMIN", platformRole: "SUPER_ADMIN" });
  });
  it("AUDIT ATTRIBUTION: the SUPER_ADMIN bypass returns the SUPER_ADMIN's own identity, never the workspace owner's", async () => {
    h.cookie = await createSessionToken(CLAIMS);
    db.session.findFirst.mockResolvedValue(dbRow("SUPER_ADMIN"));
    db.workspace.findUnique.mockResolvedValue({ ...workspace, owner: { id: "owner_1", email: "o@example.test" } }); // an owner may exist; it must not be used
    db.user.findUnique.mockResolvedValue(saSelf);
    const who = await requireWorkspaceAccess("alpha");
    expect(who.id).toBe("user_1");
    expect(who.email).toBe("db@example.test");
    expect(who.id).not.toBe("owner_1");
    expect(db.user.findUnique.mock.calls[0]![0].where).toEqual({ id: "user_1" });
    expect(db.workspace.findUnique.mock.calls[0]![0]).not.toHaveProperty("include");
  });
  it("SUPER_ADMIN on an unknown workspace -> NOT_FOUND", async () => {
    h.cookie = await createSessionToken(CLAIMS);
    db.session.findFirst.mockResolvedValue(dbRow("SUPER_ADMIN"));
    db.workspace.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(saSelf);
    await expect(requireWorkspaceAccess("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("an ordinary member keeps their workspace role", async () => {
    h.cookie = await createSessionToken(CLAIMS);
    db.workspaceMember.findFirst.mockResolvedValue({ workspaceId: "ws_1", role: "TEAM_MEMBER", user: { id: "user_1", email: "db@example.test", name: "U", avatarUrl: null, platformRole: "USER", emailVerifiedAt: null } });
    await expect(requireWorkspaceAccess("alpha")).resolves.toMatchObject({ workspaceId: "ws_1", workspaceRole: "TEAM_MEMBER", platformRole: "USER" });
  });
});
