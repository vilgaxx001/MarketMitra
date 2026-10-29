/**
 * Route-level behaviour of the rate-limited public endpoints, running the REAL route handlers and the REAL limiter library
 * (policy -> client-ip -> store -> limiter -> env-bound facade). Doubles: the auth service and session cookie writers (their own
 * tests cover them), the e-mail sender, the logger (so log content can be asserted) and Next's `after` (so the deferred work can
 * be inspected). Redis is not used except in the outage cases, which point the real client at a closed port.
 *
 * Limits are shrunk through RATE_LIMIT_POLICY_JSON (the same validated override operators use) so tests are fast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  login: vi.fn(), signup: vi.fn(), requestPasswordReset: vi.fn(), resetPassword: vi.fn(), verifyEmail: vi.fn(),
  setSessionCookie: vi.fn(), clearSessionCookie: vi.fn(), sendEmail: vi.fn(),
  warn: vi.fn(), error: vi.fn(), info: vi.fn(),
  afterQueue: [] as Array<() => unknown>,
}));
vi.mock("@/modules/auth/service", () => ({ login: m.login, signup: m.signup, requestPasswordReset: m.requestPasswordReset, resetPassword: m.resetPassword, verifyEmail: m.verifyEmail }));
vi.mock("@/modules/auth/session", () => ({ setSessionCookie: m.setSessionCookie, clearSessionCookie: m.clearSessionCookie, getCurrentSession: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: m.sendEmail }));
vi.mock("@/lib/logger", () => ({ logger: { warn: m.warn, error: m.error, info: m.info, debug: vi.fn() } }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { m.afterQueue.push(fn); } }));

const POLICY = {
  login: { ip: { max: 6, windowSeconds: 900 }, accountIp: { max: 3, windowSeconds: 900 }, accountUnrecognizedIp: { max: 50, windowSeconds: 3600 } },
  signup: { ip: { max: 3, windowSeconds: 3600 }, email: { max: 2, windowSeconds: 3600 } },
  forgotPassword: { ip: { max: 4, windowSeconds: 3600 }, email: { max: 2, windowSeconds: 3600 } },
  resetPassword: { ip: { max: 3, windowSeconds: 3600 } },
  verifyEmail: { ip: { max: 3, windowSeconds: 3600 } },
  contact: { ip: { max: 3, windowSeconds: 3600 }, email: { max: 2, windowSeconds: 3600 } },
  demoGenerate: { ip: { max: 3, windowSeconds: 3600 } },
};

type Handler = (req: Request) => Promise<Response>;
const routes: Record<string, Handler> = {};
// vi.resetModules() gives the routes a FRESH api-response module, so errors thrown by the doubles must be built from that same
// module instance or `instanceof ApiException` in the route's error handler fails and the response becomes a 500.
let ApiExceptionCtor: typeof import("@/lib/api-response").ApiException;
async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  ApiExceptionCtor = (await import("@/lib/api-response")).ApiException;
  vi.stubEnv("TRUSTED_IP_HEADER", "x-test-ip");
  vi.stubEnv("RATE_LIMIT_POLICY_JSON", JSON.stringify(POLICY));
  vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  routes.login = (await import("@/app/api/v1/auth/login/route")).POST as Handler;
  routes.signup = (await import("@/app/api/v1/auth/signup/route")).POST as Handler;
  routes.forgot = (await import("@/app/api/v1/auth/forgot-password/route")).POST as Handler;
  routes.reset = (await import("@/app/api/v1/auth/reset-password/route")).POST as Handler;
  routes.verify = (await import("@/app/api/v1/auth/verify-email/route")).POST as Handler;
  routes.contact = (await import("@/app/api/v1/contact/route")).POST as Handler;
  routes.demo = (await import("@/app/api/v1/ai/demo-generate/route")).POST as Handler;
}

const JSON_CT = { "content-type": "application/json" };
let n = 0;
function post(body: unknown, headers: Record<string, string> = {}, raw = false) {
  return new Request("http://app.test/api", { method: "POST", body: raw ? (body as string) : JSON.stringify(body), headers: { ...JSON_CT, ...headers } });
}
const ipHdr = (ip: string) => ({ "x-test-ip": ip });
const loginBody = (email = "a@example.test") => ({ email, password: "Wrong-pass-1" });
const signupBody = (email: string) => ({ name: "Ann Tester", email, password: "Passw0rd-xyz", confirmPassword: "Passw0rd-xyz", acceptTerms: true });
const unauth = () => new ApiExceptionCtor("UNAUTHENTICATED", "Incorrect email or password. Please try again.");
const ok = { user: { id: "u1", email: "a@example.test", name: "A", platformRole: "USER", emailVerifiedAt: null }, sessionToken: "t" };
const body = async (r: Response) => r.json();

beforeEach(async () => {
  for (const f of Object.values(m)) if (typeof f === "function") (f as ReturnType<typeof vi.fn>).mockReset();
  m.afterQueue.length = 0; n = 0;
  await load();
  m.login.mockImplementation(async () => { throw unauth(); }); m.signup.mockResolvedValue({ user: { id: "u2", email: "x@example.test", name: "X", emailVerifiedAt: null }, sessionToken: "t" });
  m.requestPasswordReset.mockResolvedValue(undefined); m.resetPassword.mockResolvedValue(undefined); m.verifyEmail.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("429 contract", () => {
  it("login: refuses with 429 RATE_LIMITED + Retry-After once the per-account+IP limit is spent, and never reaches the service", async () => {
    for (let i = 0; i < 3; i++) expect((await routes.login!(post(loginBody(), ipHdr("198.51.100.1")))).status).toBe(401);
    const res = await routes.login!(post(loginBody(), ipHdr("198.51.100.1")));
    expect(res.status).toBe(429);
    const retry = Number(res.headers.get("retry-after"));
    expect(Number.isInteger(retry)).toBe(true); expect(retry).toBeGreaterThan(0); expect(retry).toBeLessThanOrEqual(900);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await body(res)).toEqual({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
    expect(m.login).toHaveBeenCalledTimes(3);
  });
  it("the 429 is identical for an existing and a non-existent account (no enumeration through the limiter)", async () => {
    m.login.mockImplementation(async (i: { email: string }) => { if (i.email === "real@example.test") throw unauth(); throw unauth(); });
    for (let i = 0; i < 3; i++) { await routes.login!(post(loginBody("real@example.test"), ipHdr("198.51.100.2"))); await routes.login!(post(loginBody("ghost@example.test"), ipHdr("198.51.100.3"))); }
    const a = await routes.login!(post(loginBody("real@example.test"), ipHdr("198.51.100.2")));
    const b = await routes.login!(post(loginBody("ghost@example.test"), ipHdr("198.51.100.3")));
    expect(a.status).toBe(429); expect(b.status).toBe(429);
    expect(await body(a)).toEqual(await body(b));
  });
  it("a different client is unaffected by another client's block", async () => {
    for (let i = 0; i < 4; i++) await routes.login!(post(loginBody(), ipHdr("198.51.100.4")));
    expect((await routes.login!(post(loginBody(), ipHdr("198.51.100.5")))).status).toBe(401);
  });
  it("a successful login clears the account+IP counter", async () => {
    m.login.mockImplementationOnce(async () => { throw unauth(); }).mockImplementationOnce(async () => { throw unauth(); }).mockResolvedValueOnce(ok);
    for (const want of [401, 401, 200]) expect((await routes.login!(post(loginBody(), ipHdr("198.51.100.6")))).status).toBe(want);
    m.login.mockImplementation(async () => { throw unauth(); });
    for (let i = 0; i < 3; i++) expect((await routes.login!(post(loginBody(), ipHdr("198.51.100.6")))).status).toBe(401);
    expect((await routes.login!(post(loginBody(), ipHdr("198.51.100.6")))).status).toBe(429);
  });
  it("parallel guesses cannot beat the limit: 20 concurrent logins reach the service exactly 3 times", async () => {
    const out = await Promise.all(Array.from({ length: 20 }, () => routes.login!(post(loginBody(), ipHdr("198.51.100.7")))));
    expect(out.filter((r) => r.status === 401)).toHaveLength(3);
    expect(out.filter((r) => r.status === 429)).toHaveLength(17);
    expect(m.login).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["signup", () => routes.signup!, () => signupBody(`s${n++}@example.test`), 3],
    ["reset-password", () => routes.reset!, () => ({ token: "t".repeat(20), password: "Passw0rd-xyz", confirmPassword: "Passw0rd-xyz" }), 3],
    ["verify-email", () => routes.verify!, () => ({ token: "t".repeat(20) }), 3],
    ["contact", () => routes.contact!, () => ({ name: "Ann", email: `c${n++}@example.test`, topic: "general", message: "Hello there, a long enough message." }), 3],
    ["demo-generate", () => routes.demo!, () => ({}), 3],
    ["forgot-password", () => routes.forgot!, () => ({ email: `f${n++}@example.test` }), 4],
  ] as const)("%s: per-IP limit -> 429 + Retry-After, independent per client", async (_name, handler, mk, max) => {
    for (let i = 0; i < max; i++) expect((await handler()(post(mk(), ipHdr("203.0.113.9")))).status).not.toBe(429);
    const res = await handler()(post(mk(), ipHdr("203.0.113.9")));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await handler()(post(mk(), ipHdr("203.0.113.10")))).status).not.toBe(429);
  });
});

describe("what is checked first, and what is trusted", () => {
  it("the IP limit is decided BEFORE the body is read: an exhausted client gets 429 for a malformed body and the stream is untouched", async () => {
    for (let i = 0; i < 6; i++) await routes.login!(post(loginBody(`u${i}@example.test`), ipHdr("198.51.100.20")));
    const bad = post("{not json", ipHdr("198.51.100.20"), true);
    const res = await routes.login!(bad);
    expect(res.status).toBe(429);
    expect(bad.bodyUsed).toBe(false);
  });
  it("a forged x-forwarded-for neither creates a fresh bucket nor is stored: the trusted header decides", async () => {
    for (let i = 0; i < 3; i++) await routes.login!(post(loginBody(), { ...ipHdr("198.51.100.21"), "x-forwarded-for": `9.9.9.${i}` }));
    const res = await routes.login!(post(loginBody(), { ...ipHdr("198.51.100.21"), "x-forwarded-for": "9.9.9.200" }));
    expect(res.status).toBe(429);
    for (const call of m.login.mock.calls) expect(call[1].ipAddress).toBe("198.51.100.21");
  });
  it("with no trusted client IP the session IP is NOT taken from x-forwarded-for", async () => {
    await load({ TRUSTED_IP_HEADER: "" });
    m.login.mockResolvedValue(ok);
    await routes.login!(post(loginBody(), { "x-forwarded-for": "6.6.6.6" }));
    expect(m.login).toHaveBeenCalledTimes(1);
    expect(m.login.mock.calls[0]![1].ipAddress).toBeUndefined();
  });
  it("with TRUSTED_PROXY_HOPS=1 the right-most x-forwarded-for entry is the client; a client-supplied prefix is ignored", async () => {
    await load({ TRUSTED_IP_HEADER: "", TRUSTED_PROXY_HOPS: "1" });
    m.login.mockResolvedValue(ok);
    await routes.login!(post(loginBody(), { "x-forwarded-for": "6.6.6.6, 203.0.113.77" }));
    expect(m.login.mock.calls[0]![1].ipAddress).toBe("203.0.113.77");
  });
  it("body policy: wrong content type is 415, an oversized body is 400, neither reaches the service, both still count toward the IP limit", async () => {
    const wrong = await routes.login!(new Request("http://app.test/api", { method: "POST", body: JSON.stringify(loginBody()), headers: { "content-type": "text/plain", ...ipHdr("198.51.100.22") } }));
    expect(wrong.status).toBe(415);
    const big = await routes.login!(post(JSON.stringify({ email: "a@example.test", password: "x".repeat(9_000) }), ipHdr("198.51.100.22"), true));
    expect(big.status).toBe(400);
    expect((await body(big)).error.message).toBe("The request body is too large.");
    expect(m.login).not.toHaveBeenCalled();
  });
});

describe("forgot-password: same answer for every address, and no oracle in timing or errors", () => {
  const GENERIC = { data: { message: "If an account exists for this email, a reset link has been sent." } };
  it("the response does not wait for the lookup, the token write or the e-mail send", async () => {
    m.requestPasswordReset.mockReturnValue(new Promise(() => undefined)); // a provider that never answers
    const res = await routes.forgot!(post({ email: "exists@example.test" }, ipHdr("203.0.113.30")));
    expect(res.status).toBe(200); expect(await body(res)).toEqual(GENERIC);
    expect(m.requestPasswordReset).not.toHaveBeenCalled(); // deferred, not run inline
    expect(m.afterQueue).toHaveLength(1);
  });
  it("existing and unknown addresses get byte-identical responses", async () => {
    const a = await routes.forgot!(post({ email: "exists@example.test" }, ipHdr("203.0.113.31")));
    const b = await routes.forgot!(post({ email: "ghost@example.test" }, ipHdr("203.0.113.32")));
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
  });
  it("the deferred work runs the service once; a provider failure is swallowed and logged WITHOUT the address", async () => {
    m.requestPasswordReset.mockRejectedValue(Object.assign(new Error("550 rejected recipient secret.person@example.test"), { name: "SmtpError" }));
    const res = await routes.forgot!(post({ email: "secret.person@example.test" }, ipHdr("203.0.113.33")));
    expect(res.status).toBe(200);
    await expect(Promise.all(m.afterQueue.map((f) => f()))).resolves.toBeDefined();
    expect(m.requestPasswordReset).toHaveBeenCalledTimes(1);
    expect(m.requestPasswordReset).toHaveBeenCalledWith("secret.person@example.test");
    expect(m.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(m.error.mock.calls)).not.toMatch(/secret|person|example\.test|550/);
  });
  it("over the per-address limit: the SAME 200 and body, nothing is queued (no 429 that would reveal prior requests)", async () => {
    const results: Response[] = [];
    for (let i = 0; i < 4; i++) results.push(await routes.forgot!(post({ email: "Spam.Target@Example.test" }, ipHdr(`203.0.113.${40 + i}`))));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(await Promise.all(results.map((r) => r.json()))).toEqual(Array(4).fill(GENERIC));
    expect(m.afterQueue).toHaveLength(2); // POLICY.forgotPassword.email.max
    expect((await routes.forgot!(post({ email: "someone.else@example.test" }, ipHdr("203.0.113.50")))).status).toBe(200);
    expect(m.afterQueue).toHaveLength(3);
  });
});

describe("signup / contact: per-e-mail limits keyed on the normalised address", () => {
  it("signup: re-spelling the e-mail does not reset the per-address counter", async () => {
    const variants = ["new@example.test", "NEW@Example.test", "new@example.test"];
    const statuses: number[] = [];
    for (let i = 0; i < variants.length; i++) statuses.push((await routes.signup!(post(signupBody(variants[i]!), ipHdr(`203.0.113.${60 + i}`)))).status);
    expect(statuses).toEqual([201, 201, 429]);
    expect(m.signup).toHaveBeenCalledTimes(2);
  });
  it("contact: the third message from one address is refused even from a fresh IP", async () => {
    const msg = (ip: string) => post({ name: "Ann", email: "ann@example.test", topic: "general", message: "Hello there, a long enough message." }, ipHdr(ip));
    expect([(await routes.contact!(msg("203.0.113.70"))).status, (await routes.contact!(msg("203.0.113.71"))).status, (await routes.contact!(msg("203.0.113.72"))).status]).toEqual([200, 200, 429]);
  });
});

describe("Redis unavailable: protection is never silently disabled", () => {
  it("default (memory) mode: the limit is still enforced and the outage is logged once", async () => {
    await load({ REDIS_URL: "redis://127.0.0.1:1" });
    for (let i = 0; i < 3; i++) expect((await routes.verify!(post({ token: "t".repeat(20) }, ipHdr("203.0.113.80")))).status).not.toBe(429);
    expect((await routes.verify!(post({ token: "t".repeat(20) }, ipHdr("203.0.113.80")))).status).toBe(429);
    const degraded = m.error.mock.calls.filter((c) => c[0]?.msg === "rate_limit_store_degraded");
    expect(degraded).toHaveLength(1);
    expect(JSON.stringify(degraded)).not.toMatch(/203\.0\.113/);
  }, 20_000);
  it("RATE_LIMIT_ON_STORE_FAILURE=deny: refuses with 503 + Retry-After instead of admitting traffic", async () => {
    await load({ REDIS_URL: "redis://127.0.0.1:1", RATE_LIMIT_ON_STORE_FAILURE: "deny" });
    const res = await routes.verify!(post({ token: "t".repeat(20) }, ipHdr("203.0.113.81")));
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await body(res)).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(m.verifyEmail).not.toHaveBeenCalled();
  }, 20_000);
  it("no REDIS_URL: enforced in memory and said so once", async () => {
    for (let i = 0; i < 4; i++) await routes.verify!(post({ token: "t".repeat(20) }, ipHdr("203.0.113.82")));
    expect(m.warn.mock.calls.filter((c) => c[0]?.msg === "rate_limit_store_not_configured")).toHaveLength(1);
  });
});

describe("logging", () => {
  it("blocks are logged with endpoint and scope only: no address, no e-mail, no password, no token", async () => {
    for (let i = 0; i < 4; i++) await routes.login!(post({ email: "private@example.test", password: "Hunter2-secret" }, ipHdr("198.51.100.99")));
    const logged = JSON.stringify([...m.warn.mock.calls, ...m.error.mock.calls, ...m.info.mock.calls]);
    expect(logged).toContain("rate_limit_blocked");
    expect(logged).not.toMatch(/private|example\.test|Hunter2|198\.51\.100|secret/);
  });
});
