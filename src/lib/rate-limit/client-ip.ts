/**
 * src/lib/rate-limit/client-ip.ts
 *
 * Determines the client IP a rate limit is keyed on, WITHOUT trusting anything the client can forge.
 *
 * A browser or attacker controls every request header that reaches the app unless a reverse proxy in front of it
 * overwrites or appends to it. So:
 *   - default (nothing configured): NO header is trusted. The client is "unknown" and the limiter applies a shared
 *     flood ceiling instead of a per-client limit (see policy.unknownIpMultiplier).
 *   - TRUSTED_IP_HEADER=<name>: the named header is trusted as a single IP. Use ONLY when the edge (Cloudflare's
 *     cf-connecting-ip, Vercel's x-real-ip, nginx's x-real-ip ...) overwrites any client-supplied copy. If the header is
 *     missing or not a single valid IP the client is "unknown": it never falls back to x-forwarded-for.
 *   - TRUSTED_PROXY_HOPS=<n>: n proxies sit in front of the app and each APPENDS the address it received the connection
 *     from to x-forwarded-for. The client is the n-th entry counted from the RIGHT; entries to its left are client-supplied
 *     and ignored, so a forged `x-forwarded-for: 1.2.3.4` prefix changes nothing. Fewer entries than hops means the
 *     request did not come through the proxies: "unknown".
 *
 * IPv6: addresses are bucketed by /64, because one subscriber typically owns a whole /64 and could otherwise rotate through
 * 2^64 addresses to get a fresh limit every request. IPv4-mapped IPv6 (::ffff:a.b.c.d) is folded to the IPv4 address.
 *
 * Pure: no env, no I/O. Callers pass the configuration.
 */
import { isIP } from "node:net";

export interface ClientIpConfig {
  /** Number of trusted reverse proxies appending to x-forwarded-for. 0 = do not read x-forwarded-for. */
  trustedProxyHops: number;
  /** Lower-case name of a header the trusted edge sets to the single client IP. Takes precedence over hops. */
  trustedIpHeader?: string;
}

export interface ClientIp {
  /** Canonical textual address, or null when no trusted client IP could be determined. */
  address: string | null;
  /** The rate-limit bucket: the IPv4 address, `v6:<first four groups>`, or "unknown". */
  bucket: string;
}

export const UNKNOWN_CLIENT: ClientIp = { address: null, bucket: "unknown" };

function expandV6(input: string): number[] | null {
  let s = input.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  const v4 = s.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const p = [v4[2], v4[3], v4[4], v4[5]].map(Number);
    if (p.some((n) => n > 255)) return null;
    s = `${v4[1]}${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

const hex4 = (n: number) => n.toString(16).padStart(4, "0");

/** Parses one candidate IP (optionally with a port or brackets). Returns null for anything that is not exactly one IP. */
export function parseClientIp(raw: string | null | undefined): ClientIp | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || s.length > 64) return null;
  const bracket = s.match(/^\[([^\]]+)\](?::\d{1,5})?$/);
  if (bracket) s = bracket[1]!;
  else {
    const v4port = s.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/);
    if (v4port) s = v4port[1]!;
  }
  const zoneless = s.includes("%") ? s.slice(0, s.indexOf("%")) : s;
  const kind = isIP(zoneless);
  if (kind === 4) return { address: zoneless, bucket: zoneless };
  if (kind !== 6) return null;
  const g = expandV6(zoneless);
  if (!g) return null;
  // IPv4-mapped (::ffff:a.b.c.d): same host as the IPv4 address.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const v4 = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
    return { address: v4, bucket: v4 };
  }
  return { address: g.map(hex4).join(":"), bucket: `v6:${g.slice(0, 4).map(hex4).join(":")}` };
}

export function resolveClientIp(headers: Headers, cfg: ClientIpConfig): ClientIp {
  if (cfg.trustedIpHeader) {
    return parseClientIp(headers.get(cfg.trustedIpHeader)) ?? UNKNOWN_CLIENT;
  }
  if (cfg.trustedProxyHops > 0) {
    const xff = headers.get("x-forwarded-for");
    if (!xff) return UNKNOWN_CLIENT;
    const entries = xff.split(",");
    const idx = entries.length - cfg.trustedProxyHops;
    if (idx < 0) return UNKNOWN_CLIENT;
    return parseClientIp(entries[idx]) ?? UNKNOWN_CLIENT;
  }
  return UNKNOWN_CLIENT;
}
