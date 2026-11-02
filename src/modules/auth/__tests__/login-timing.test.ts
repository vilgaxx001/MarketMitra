/**
 * Login must spend the same bcrypt work whether or not the e-mail exists, otherwise response time reveals
 * which e-mails are registered. Regression: the unknown-user path used a malformed hash
 * ("$2b$12$invalidhashforunknownusers", 33 chars) which bcryptjs rejects instantly (~0.02 ms vs ~300 ms).
 * DOUBLE: repository (no DB). bcryptjs is real — the cost factor is the thing under test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
const repo = vi.hoisted(() => ({ findUserByEmail: vi.fn() }));
vi.mock("@/modules/auth/repository", () => repo);
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), emailTemplates: {} }));
import { login, getDummyPasswordHash } from "@/modules/auth/service";

beforeEach(() => repo.findUserByEmail.mockReset());

describe("login unknown-user path", () => {
  it("compares against a well-formed 60-char bcrypt hash at cost 12", async () => {
    const h = await getDummyPasswordHash();
    expect(h).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
    expect(h).toHaveLength(60);
    expect(bcrypt.getRounds(h)).toBe(12);
  }, 30_000);

  it("is generated once and reused", async () => {
    expect(await getDummyPasswordHash()).toBe(await getDummyPasswordHash());
  }, 30_000);

  it("does real bcrypt work for an unknown e-mail (not an instant rejection) and still fails closed", async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    await getDummyPasswordHash(); // exclude one-time generation from the measurement
    const spy = vi.spyOn(bcrypt, "compare");
    const t0 = performance.now();
    await expect(login({ email: "nobody@example.test", password: "Whatever-123", rememberMe: false })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const ms = performance.now() - t0;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![1])).toHaveLength(60);
    // cost-12 bcrypt takes tens-to-hundreds of ms; the malformed-hash bug took <1 ms. 10 ms is far from both sides' noise.
    expect(ms).toBeGreaterThan(10);
    spy.mockRestore();
  }, 30_000);

  it("known user + wrong password and unknown user return the same error", async () => {
    const hash = await bcrypt.hash("Correct-Horse-1", 12);
    repo.findUserByEmail.mockResolvedValueOnce({ id: "u1", email: "a@example.test", passwordHash: hash, isActive: true });
    const known = await login({ email: "a@example.test", password: "wrong-password-1", rememberMe: false }).catch((e) => e);
    repo.findUserByEmail.mockResolvedValueOnce(null);
    const unknown = await login({ email: "b@example.test", password: "wrong-password-1", rememberMe: false }).catch((e) => e);
    expect(known.code).toBe(unknown.code);
    expect(known.message).toBe(unknown.message);
  }, 30_000);
});
