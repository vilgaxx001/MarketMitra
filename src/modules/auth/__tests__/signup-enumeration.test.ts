/**
 * Signup is account-enumeration safe. Route-level indistinguishability (status, body, headers, latency) is covered in
 * src/lib/rate-limit/__tests__/routes.test.ts and, end to end, by the HTTP suite. This file covers the deferred work
 * (registerAccount): what actually happens for a new address, for an existing one, for a lost unique-index race, and for failures.
 * DOUBLES: repository (no DB), e-mail adapter (records sends), logger, env. bcryptjs is real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const m = vi.hoisted(() => ({
  findUserByEmail: vi.fn(), createUser: vi.fn(), createEmailVerificationToken: vi.fn(),
  sendEmail: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  env: { ENABLE_SIGNUPS: true, APP_URL: "https://app.example.test" } as Record<string, unknown>,
}));
vi.mock("@/modules/auth/repository", () => ({ findUserByEmail: m.findUserByEmail, createUser: m.createUser, createEmailVerificationToken: m.createEmailVerificationToken }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ env: m.env, isProduction: false }));
vi.mock("@/lib/logger", () => ({ logger: { info: m.info, error: m.error, warn: m.warn, debug: vi.fn() } }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail: m.sendEmail }));
import { registerAccount, assertSignupsEnabled } from "@/modules/auth/service";

const input = { name: "Ann Tester", email: "ann@example.test", password: "Passw0rd-xyz", confirmPassword: "Passw0rd-xyz", acceptTerms: true as const };
const user = { id: "u_new", email: "ann@example.test", name: "Ann Tester" };
const sentTo = () => m.sendEmail.mock.calls.map((c) => ({ to: c[0].to as string, subject: c[0].subject as string, html: c[0].html as string }));

beforeEach(() => {
  [m.findUserByEmail, m.createUser, m.createEmailVerificationToken, m.sendEmail, m.info, m.error, m.warn].forEach((f) => f.mockReset());
  m.env.ENABLE_SIGNUPS = true;
  m.createEmailVerificationToken.mockResolvedValue(undefined); m.sendEmail.mockResolvedValue({ messageId: "m1" });
});

describe("registerAccount: new address", () => {
  it("creates the user with a bcrypt hash (never the password) and sends exactly one verification e-mail to it", async () => {
    m.findUserByEmail.mockResolvedValue(null); m.createUser.mockResolvedValue(user);
    await registerAccount(input);
    const created = m.createUser.mock.calls[0]![0];
    expect(created).toMatchObject({ name: "Ann Tester", email: "ann@example.test" });
    expect(created.passwordHash).toMatch(/^\$2[aby]\$12\$/); expect(created.passwordHash).not.toContain("Passw0rd");
    expect(await bcrypt.compare(input.password, created.passwordHash)).toBe(true);
    expect(sentTo()).toHaveLength(1);
    expect(sentTo()[0]).toMatchObject({ to: "ann@example.test", subject: "Verify your MarketMitra email" });
    expect(m.createEmailVerificationToken).toHaveBeenCalledTimes(1);
  }, 30_000);
  it("a verification-mail failure does not undo the signup and is logged by error name only", async () => {
    m.findUserByEmail.mockResolvedValue(null); m.createUser.mockResolvedValue(user);
    m.sendEmail.mockRejectedValue(Object.assign(new Error("550 rejected ann@example.test"), { name: "SmtpError" }));
    await expect(registerAccount(input)).resolves.toBeUndefined();
    const logged = JSON.stringify(m.error.mock.calls);
    expect(logged).toContain("SmtpError"); expect(logged).not.toMatch(/ann|example\.test|550/);
  }, 30_000);
});

describe("registerAccount: address that already has an account", () => {
  it("creates NO second account, issues NO token, and tells the OWNER (only) that somebody tried", async () => {
    m.findUserByEmail.mockResolvedValue({ id: "u_old", email: "ann@example.test", name: "Ann Old" });
    await registerAccount({ ...input, name: "Mallory", password: "Different-Pass1" });
    expect(m.createUser).not.toHaveBeenCalled();
    expect(m.createEmailVerificationToken).not.toHaveBeenCalled();
    const mails = sentTo();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "ann@example.test", subject: "You already have a MarketMitra account" });
    expect(mails[0]!.html).toContain("https://app.example.test/login");
    expect(mails[0]!.html).toContain("https://app.example.test/forgot-password");
    expect(mails[0]!.html).toContain("Ann Old"); // the OWNER's name, not the submitter's
    expect(mails[0]!.html).not.toContain("Mallory");
  }, 30_000);
  it("the existing account's password and data are untouched (nothing but a read happens)", async () => {
    m.findUserByEmail.mockResolvedValue({ id: "u_old", email: "ann@example.test", name: "Ann Old" });
    await registerAccount(input);
    expect(m.findUserByEmail).toHaveBeenCalledTimes(1);
    expect(m.createUser).not.toHaveBeenCalled();
  }, 30_000);
  it("computes the password hash on both paths (same shape of deferred work)", async () => {
    const spy = vi.spyOn(bcrypt, "hash");
    m.findUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u_old", email: "ann@example.test", name: "Ann Old" });
    m.createUser.mockResolvedValue(user);
    await registerAccount(input); await registerAccount(input);
    expect(spy.mock.calls.filter((c) => typeof c[1] === "number")).toHaveLength(2);
    spy.mockRestore();
  }, 60_000);
  it("an existing-account notice that fails to send is logged by name and does not throw", async () => {
    m.findUserByEmail.mockResolvedValue({ id: "u_old", email: "ann@example.test", name: "Ann Old" });
    m.sendEmail.mockRejectedValue(Object.assign(new Error("boom ann@example.test"), { name: "ProviderError" }));
    await expect(registerAccount(input)).resolves.toBeUndefined();
    expect(JSON.stringify(m.error.mock.calls)).not.toMatch(/ann@|example\.test/);
  }, 30_000);
});

describe("registerAccount: concurrent duplicate (unique-index race)", () => {
  it("losing the race is treated as the existing-address case: no duplicate, owner notified, no throw", async () => {
    m.findUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u_winner", email: "ann@example.test", name: "Ann Winner" });
    m.createUser.mockRejectedValue(Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), { code: "P2002" }));
    await expect(registerAccount(input)).resolves.toBeUndefined();
    expect(sentTo()).toHaveLength(1);
    expect(sentTo()[0]!.subject).toBe("You already have a MarketMitra account");
    expect(m.createEmailVerificationToken).not.toHaveBeenCalled();
  }, 30_000);
  it("any other database error propagates (the route logs it by name) instead of being mistaken for a duplicate", async () => {
    m.findUserByEmail.mockResolvedValue(null);
    m.createUser.mockRejectedValue(Object.assign(new Error("connection lost"), { code: "P1001" }));
    await expect(registerAccount(input)).rejects.toThrow("connection lost");
    expect(m.sendEmail).not.toHaveBeenCalled();
  }, 30_000);
});

describe("assertSignupsEnabled", () => {
  it("is the only synchronous decision and does not look at any address", () => {
    expect(() => assertSignupsEnabled()).not.toThrow();
    m.env.ENABLE_SIGNUPS = false;
    expect(() => assertSignupsEnabled()).toThrowError(/disabled/);
    expect(m.findUserByEmail).not.toHaveBeenCalled();
  });
});
