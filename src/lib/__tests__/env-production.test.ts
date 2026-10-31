/**
 * Production configuration is validated at boot (finding: "production must configure TRUSTED_IP_HEADER or TRUSTED_PROXY_HOPS and
 * REDIS_URL" was only documented, and only warned about). With the REAL src/lib/env.ts: a production process refuses to start
 * when the client-IP trust source or Redis is missing, unless the operator acknowledges the weaker setup explicitly, and
 * ambiguous or forgeable client-IP configurations are rejected in every environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const PROD_BASE: Record<string, string> = {
  NODE_ENV: "production",
  APP_URL: "https://app.example.test",
  DATABASE_URL: "postgresql://u:p@db.example.test:5432/app",
  DIRECT_URL: "postgresql://u:p@db.example.test:5432/app",
  SESSION_SECRET: "prod-test-secret-prod-test-secret-1234567890",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_placeholder_not_a_credential",
  EMAIL_FROM: "noreply@example.test",
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "sk-placeholder-not-a-credential-000000",
  STORAGE_PROVIDER: "local",
  REDIS_URL: "redis://redis.example.test:6379",
  TRUSTED_IP_HEADER: "cf-connecting-ip",
};
const MANAGED = ["TRUSTED_IP_HEADER", "TRUSTED_PROXY_HOPS", "REDIS_URL", "RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP", "RATE_LIMIT_ALLOW_MEMORY_STORE", "CONTACT_INBOX_EMAIL", "RATE_LIMIT_POLICY_JSON", "RATE_LIMIT_ON_STORE_FAILURE"];

async function boot(over: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const k of MANAGED) vi.stubEnv(k, undefined as unknown as string);
  const all = { ...PROD_BASE, ...over };
  for (const [k, v] of Object.entries(all)) { if (v === undefined) vi.stubEnv(k, undefined as unknown as string); else vi.stubEnv(k, v); }
  return import("@/lib/env");
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllEnvs(); warn.mockRestore(); });

describe("production boots with a complete, unambiguous configuration", () => {
  it.each([
    ["trusted header", { TRUSTED_IP_HEADER: "cf-connecting-ip" }],
    ["trusted proxy hops", { TRUSTED_IP_HEADER: undefined, TRUSTED_PROXY_HOPS: "1" }],
  ])("%s + Redis", async (_n, over) => {
    const { env } = await boot(over);
    expect(env.NODE_ENV).toBe("production");
    expect(env.REDIS_URL).toBeTruthy();
  });
});

describe("production refuses to start with a silently weakened rate limiter", () => {
  it("no trusted client-IP source", async () => {
    await expect(boot({ TRUSTED_IP_HEADER: undefined })).rejects.toThrow(/Neither TRUSTED_IP_HEADER nor TRUSTED_PROXY_HOPS/);
  });
  it("no REDIS_URL", async () => {
    await expect(boot({ REDIS_URL: undefined })).rejects.toThrow(/REDIS_URL is not set/);
  });
  it("both problems are reported together (one deploy, one fix)", async () => {
    const e = (await boot({ REDIS_URL: undefined, TRUSTED_IP_HEADER: undefined }).catch((x) => x)) as Error;
    expect(e.message).toMatch(/Neither TRUSTED_IP_HEADER/); expect(e.message).toMatch(/REDIS_URL is not set/);
  });
});

describe("explicit acknowledgement is the only way to run without them, and it is loud", () => {
  it("RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP=true boots and warns", async () => {
    await boot({ TRUSTED_IP_HEADER: undefined, RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP: "true" });
    expect(warn.mock.calls.flat().join("\n")).toMatch(/RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP=true/);
  });
  it("RATE_LIMIT_ALLOW_MEMORY_STORE=true boots and warns", async () => {
    await boot({ REDIS_URL: undefined, RATE_LIMIT_ALLOW_MEMORY_STORE: "true" });
    expect(warn.mock.calls.flat().join("\n")).toMatch(/RATE_LIMIT_ALLOW_MEMORY_STORE=true/);
  });
  it('"false" is not read as true', async () => {
    await expect(boot({ TRUSTED_IP_HEADER: undefined, RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP: "false" })).rejects.toThrow(/Neither TRUSTED_IP_HEADER/);
  });
  it("anything but true/false is rejected, not guessed", async () => {
    await expect(boot({ RATE_LIMIT_ALLOW_MEMORY_STORE: "yes" })).rejects.toThrow(/RATE_LIMIT_ALLOW_MEMORY_STORE/);
  });
});

describe("forgeable or ambiguous client-IP configuration is rejected", () => {
  it("both TRUSTED_IP_HEADER and TRUSTED_PROXY_HOPS", async () => {
    await expect(boot({ TRUSTED_IP_HEADER: "x-real-ip", TRUSTED_PROXY_HOPS: "1" })).rejects.toThrow(/Set exactly one/);
  });
  it.each(["x-forwarded-for", "forwarded", "X-Forwarded-For"])("TRUSTED_IP_HEADER=%s (a list header the client can prepend to)", async (h) => {
    await expect(boot({ TRUSTED_IP_HEADER: h })).rejects.toThrow(/list header/);
  });
  it("a header name that is not a plain header name", async () => {
    await expect(boot({ TRUSTED_IP_HEADER: "x real ip\r\nx-evil: 1" })).rejects.toThrow();
  });
  it("a REDIS_URL that is not a redis URL", async () => {
    await expect(boot({ REDIS_URL: "http://redis.example.test" })).rejects.toThrow(/redis:\/\/ or rediss:\/\//);
  });
  it("an invalid RATE_LIMIT_POLICY_JSON override", async () => {
    await expect(boot({ RATE_LIMIT_POLICY_JSON: '{"signup":{"ip":{"max":0}}}' })).rejects.toThrow(/RATE_LIMIT_POLICY_JSON/);
  });
});

describe("outside production the same mistakes only warn (development stays easy)", () => {
  it("no trusted source and no Redis in development boots", async () => {
    const { env } = await boot({ NODE_ENV: "development", TRUSTED_IP_HEADER: undefined, REDIS_URL: undefined });
    expect(env.NODE_ENV).toBe("development");
  });
  it("but an AMBIGUOUS client-IP configuration is still reported in development", async () => {
    await boot({ NODE_ENV: "development", TRUSTED_IP_HEADER: "x-real-ip", TRUSTED_PROXY_HOPS: "1" });
    expect(warn.mock.calls.flat().join("\n")).toMatch(/Set exactly one/);
  });
});

describe("contact inbox", () => {
  it("production warns (does not fail) when CONTACT_INBOX_EMAIL is unset: submissions are accepted but not delivered", async () => {
    await boot();
    expect(warn.mock.calls.flat().join("\n")).toMatch(/CONTACT_INBOX_EMAIL not set in production/);
  });
});
