import { describe, it, expect } from "vitest";
import { DEFAULT_POLICY, parsePolicy } from "@/lib/rate-limit/policy";

describe("parsePolicy", () => {
  it("returns the documented defaults for no override", () => {
    for (const v of [undefined, "", "   "]) {
      const r = parsePolicy(v);
      expect(r.ok && r.policy).toEqual(DEFAULT_POLICY);
    }
  });
  it("merges a partial override and leaves every other value at its default", () => {
    const r = parsePolicy(JSON.stringify({ login: { ip: { max: 60 } }, contact: { email: { windowSeconds: 7200 } } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policy.login.ip).toEqual({ max: 60, windowSeconds: DEFAULT_POLICY.login.ip.windowSeconds });
    expect(r.policy.contact.email).toEqual({ max: DEFAULT_POLICY.contact.email.max, windowSeconds: 7200 });
    expect(r.policy.login.accountIp).toEqual(DEFAULT_POLICY.login.accountIp);
    expect(r.policy.signup).toEqual(DEFAULT_POLICY.signup);
  });
  it.each([
    ["not json", "{nope"],
    ["unknown top-level key", JSON.stringify({ logn: { ip: { max: 1 } } })],
    ["unknown nested key", JSON.stringify({ login: { ip: { maxx: 1 } } })],
    ["zero (would deny everything)", JSON.stringify({ login: { ip: { max: 0 } } })],
    ["negative", JSON.stringify({ login: { ip: { max: -5 } } })],
    ["fractional", JSON.stringify({ login: { ip: { max: 1.5 } } })],
    ["string number", JSON.stringify({ login: { ip: { max: "30" } } })],
    ["an extra zero that would disable the control", JSON.stringify({ login: { accountIp: { max: 5_000_000 } } })],
    ["window beyond 7 days", JSON.stringify({ signup: { ip: { windowSeconds: 8 * 86400 } } })],
    ["array instead of object", "[]"],
    ["null", "null"],
  ])("rejects %s with a message that names the problem and echoes no input", (_name, json) => {
    const r = parsePolicy(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^RATE_LIMIT_POLICY_JSON is /);
  });
});
