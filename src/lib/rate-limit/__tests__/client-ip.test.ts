import { describe, it, expect } from "vitest";
import { parseClientIp, resolveClientIp, UNKNOWN_CLIENT } from "@/lib/rate-limit/client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("resolveClientIp: nothing configured trusts nothing", () => {
  it("ignores x-forwarded-for, x-real-ip and cf-connecting-ip entirely", () => {
    const headers = h({ "x-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8", "cf-connecting-ip": "7.7.7.7" });
    expect(resolveClientIp(headers, { trustedProxyHops: 0 })).toEqual(UNKNOWN_CLIENT);
  });
});

describe("resolveClientIp: TRUSTED_PROXY_HOPS counts from the RIGHT of x-forwarded-for", () => {
  it("1 hop: the last entry is the client as seen by the trusted proxy", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.5" }), { trustedProxyHops: 1 }).address).toBe("203.0.113.5");
  });
  it("a forged prefix supplied by the client does not change the result", () => {
    const real = resolveClientIp(h({ "x-forwarded-for": "203.0.113.5" }), { trustedProxyHops: 1 });
    const forged = resolveClientIp(h({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.5" }), { trustedProxyHops: 1 });
    expect(forged).toEqual(real);
  });
  it("2 hops: the second entry from the right", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.5, 10.0.0.2" }), { trustedProxyHops: 2 }).address).toBe("203.0.113.5");
  });
  it("fewer entries than hops means the request did not pass through the proxies: unknown", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.5" }), { trustedProxyHops: 2 })).toEqual(UNKNOWN_CLIENT);
  });
  it("missing header, or a non-IP entry at the trusted position: unknown (never a fallback to another entry)", () => {
    expect(resolveClientIp(h({}), { trustedProxyHops: 1 })).toEqual(UNKNOWN_CLIENT);
    expect(resolveClientIp(h({ "x-forwarded-for": "1.2.3.4, not-an-ip" }), { trustedProxyHops: 1 })).toEqual(UNKNOWN_CLIENT);
    expect(resolveClientIp(h({ "x-forwarded-for": "1.2.3.4," }), { trustedProxyHops: 1 })).toEqual(UNKNOWN_CLIENT);
  });
});

describe("resolveClientIp: TRUSTED_IP_HEADER", () => {
  const cfg = { trustedProxyHops: 0, trustedIpHeader: "cf-connecting-ip" };
  it("uses the named header as a single IP", () => {
    expect(resolveClientIp(h({ "cf-connecting-ip": "198.51.100.7" }), cfg).address).toBe("198.51.100.7");
  });
  it("takes precedence over x-forwarded-for and hops, and never falls back to them", () => {
    const withBoth = { trustedProxyHops: 1, trustedIpHeader: "cf-connecting-ip" };
    expect(resolveClientIp(h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" }), withBoth).address).toBe("198.51.100.7");
    expect(resolveClientIp(h({ "x-forwarded-for": "1.1.1.1" }), withBoth)).toEqual(UNKNOWN_CLIENT);
  });
  it("a list or garbage in the header is unknown, not 'the first one'", () => {
    expect(resolveClientIp(h({ "cf-connecting-ip": "1.1.1.1, 2.2.2.2" }), cfg)).toEqual(UNKNOWN_CLIENT);
    expect(resolveClientIp(h({ "cf-connecting-ip": "unknown" }), cfg)).toEqual(UNKNOWN_CLIENT);
  });
});

describe("parseClientIp", () => {
  it("accepts IPv4, IPv4 with a port, and bracketed IPv6 with a port", () => {
    expect(parseClientIp("203.0.113.9")?.bucket).toBe("203.0.113.9");
    expect(parseClientIp("203.0.113.9:51234")?.bucket).toBe("203.0.113.9");
    expect(parseClientIp("[2001:db8::1]:443")?.bucket).toBe("v6:2001:0db8:0000:0000");
  });
  it("rejects anything that is not exactly one IP", () => {
    for (const bad of ["", " ", "abc", "1.2.3", "1.2.3.4.5", "999.1.1.1", "1.2.3.4, 5.6.7.8", "01.2.3.4", "a".repeat(100), "2001:db8::g", "1:2:3:4:5:6:7:8:9", ":::", "1::2::3"]) {
      expect(parseClientIp(bad), bad).toBeNull();
    }
    expect(parseClientIp(null)).toBeNull();
    expect(parseClientIp(undefined)).toBeNull();
  });
  it("buckets IPv6 by /64: rotating the host part does not give a fresh bucket", () => {
    const a = parseClientIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd")!;
    const b = parseClientIp("2001:db8:1:2::1")!;
    const c = parseClientIp("2001:db8:1:3::1")!;
    expect(a.bucket).toBe(b.bucket);
    expect(a.bucket).not.toBe(c.bucket);
    expect(a.bucket).toBe("v6:2001:0db8:0001:0002");
  });
  it("folds IPv4-mapped IPv6 to the IPv4 address and ignores a zone id", () => {
    expect(parseClientIp("::ffff:203.0.113.9")?.bucket).toBe("203.0.113.9");
    expect(parseClientIp("::ffff:cb00:7109")?.bucket).toBe("203.0.113.9");
    expect(parseClientIp("fe80::1%eth0")?.bucket).toBe("v6:fe80:0000:0000:0000");
  });
  it("handles the all-zero and loopback forms", () => {
    expect(parseClientIp("::")?.bucket).toBe("v6:0000:0000:0000:0000");
    expect(parseClientIp("::1")?.bucket).toBe("v6:0000:0000:0000:0000");
  });
  it("upper and lower case spellings of the same IPv6 address share a bucket", () => {
    expect(parseClientIp("2001:DB8::1")?.bucket).toBe(parseClientIp("2001:db8::1")?.bucket);
  });
});
