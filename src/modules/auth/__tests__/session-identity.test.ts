/**
 * resolveActiveSessionIdentity / findActiveSessionIdentity: the lookup that makes the DATABASE (not a token claim or a
 * header) the authority for a request's role, email and account state.
 * DOUBLE: Prisma `db`. The same query against a real PostgreSQL runs in scripts/http-verification (identity-header section).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
const db = vi.hoisted(() => ({ session: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
import { resolveActiveSessionIdentity } from "@/modules/auth/service";

beforeEach(() => db.session.findFirst.mockReset());

describe("resolveActiveSessionIdentity", () => {
  it("returns the identity the DATABASE holds (role and email from the user row)", async () => {
    db.session.findFirst.mockResolvedValue({ id: "s1", user: { id: "u1", email: "db@example.test", platformRole: "SUPER_ADMIN" } });
    await expect(resolveActiveSessionIdentity("s1", "u1")).resolves.toEqual({ sessionId: "s1", userId: "u1", email: "db@example.test", platformRole: "SUPER_ADMIN" });
  });
  it("is null when no live row matches (deleted by logout / password change / reset, expired, or the user is deactivated)", async () => {
    db.session.findFirst.mockResolvedValue(null);
    await expect(resolveActiveSessionIdentity("s1", "u1")).resolves.toBeNull();
  });
  it("binds the session id AND its user AND an unexpired row AND an ACTIVE user in one query", async () => {
    db.session.findFirst.mockResolvedValue(null);
    const before = Date.now();
    await resolveActiveSessionIdentity("s1", "u1");
    expect(db.session.findFirst).toHaveBeenCalledTimes(1);
    const arg = db.session.findFirst.mock.calls[0]![0];
    expect(arg.where).toMatchObject({ id: "s1", userId: "u1", user: { isActive: true } });
    expect(arg.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(arg.where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before - 5);
    expect(arg.select.user.select).toMatchObject({ id: true, email: true, platformRole: true });
  });
});
