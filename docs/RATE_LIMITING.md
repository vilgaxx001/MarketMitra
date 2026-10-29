# Rate limiting and request-body limits

Code: `src/lib/rate-limit/` (policy, client-ip, store, limiter, index) and `src/lib/bounded-json.ts`.
Tests: `src/lib/rate-limit/__tests__/` (unit tests, tests against a real Redis, and route-level tests of the real handlers), `src/lib/__tests__/bounded-json.test.ts`,
`src/lib/__tests__/route-body-guard.test.ts`, and the HTTP suite section "Public-endpoint rate limits, body bounds and
forgot-password deferral" (`scripts/http-verification/run.mjs`).

## What is limited

Only the **unauthenticated** endpoints, which have no session to throttle by. Authenticated routes are bounded by their session
and permission checks (and the AI execute route by its own per-workspace limiter).

| Endpoint | Per client IP (before the body is read) | Per identifier |
|---|---|---|
| `POST /auth/login` | 30 / 15 min | 5 / 15 min per **account + IP**, cleared by a successful login; 20 / hour per **account** counting only IPs that have not logged in to it within 30 days |
| `POST /auth/signup` | 5 / hour | 3 / hour per e-mail → `429` |
| `POST /auth/forgot-password` | 5 / hour | 3 / hour per e-mail → the **same 200**, nothing sent |
| `POST /auth/reset-password` | 10 / hour | none (see below) |
| `POST /auth/verify-email` | 10 / hour | none |
| `POST /contact` | 5 / hour | 3 / hour per e-mail → `429` |
| `POST /ai/demo-generate` | 20 / hour | none |

These are conservative **starting points, not measured optima**. Tune them from real traffic. Every one can be overridden
without a code change through `RATE_LIMIT_POLICY_JSON`, a strict JSON object validated at boot (unknown keys, zero, negatives,
fractions, and values above 100 000 requests or 7 days are refused and the app does not start):

```
RATE_LIMIT_POLICY_JSON={"login":{"ip":{"max":60}},"contact":{"email":{"windowSeconds":7200}}}
```

Why these numbers: a person mistyping needs a handful of attempts, an online guesser thousands, so 5 per account+IP per 15
minutes makes a 10⁶-guess list take years from one address. IP limits for login are high because offices and mobile carriers
share addresses. Signup, forgot-password and contact send mail or create rows and have no legitimate burst. Reset and verify
tokens carry 286 bits of entropy, so the per-IP limit exists to stop cheap probing, not to protect the secret; there is
deliberately no per-token limit, because a guesser changes the token on every request and would get a fresh counter each time.

## How a limit works

* **Fixed windows.** One Lua script (`INCR`, then `PEXPIRE` only if the key has no TTL) creates the counter *with* its expiry in a
  single Redis command and never extends it. There is no moment where a counter exists without an expiry (the INCR-then-EXPIRE
  race that can strand a lockout forever), a key stranded without one by an earlier crash heals on its next hit, and traffic during
  a block cannot keep the block alive. Cost: a client can make up to 2× the limit across a window boundary.
* **Atomic under concurrency.** Counters are incremented *before* the work they guard, so parallel requests cannot pass a
  "check, then record" gap: with a limit of 5, exactly 5 of 40 parallel logins reach the password check (verified over real HTTP
  and against two Redis connections).
* **One response for every limit.** `429 RATE_LIMITED`, the same message whichever counter tripped, `Retry-After` = seconds left
  in that window, `Cache-Control: no-store`. A response never says whether an account exists or which limit was hit.
* **Keys hold no e-mail.** Identifiers are normalised (NFKC, trimmed, lower-cased, so look-alike forms share one counter) and keyed
  with HMAC-SHA-256 under `SESSION_SECRET`, truncated to 128 bits. Logs carry the endpoint and the scope that tripped, nothing
  else, at most once per minute per endpoint+scope.

### Login lockout without permanent denial of service

Every block is a fixed window that ends by itself. The brute-force counter is keyed on **account + IP**, so an attacker blocking
the owner's account from the attacker's address does not block the owner anywhere else. The account-wide counter ignores
addresses the owner has logged in from in the last 30 days. **Residual risk:** an owner logging in from a *new* address while an
attacker is actively spraying that account can be refused for up to one window (default 1 hour) per 20 attacker attempts.

## Which client IP is trusted

A browser controls every header that reaches the app unless a proxy in front overwrites or appends to it, so **by default no
header is trusted**: all clients of an endpoint share one bucket whose limit is multiplied by `unknownIpMultiplier` (10). That is
a flood ceiling, not a per-client control, and one caller can exhaust it for everyone. **Production must configure one of:**

| Deployment | Setting |
|---|---|
| Behind Cloudflare | `TRUSTED_IP_HEADER=cf-connecting-ip` |
| Behind nginx / Vercel / a proxy that sets a single client-IP header and strips client copies | `TRUSTED_IP_HEADER=x-real-ip` |
| Behind *n* proxies that each append to `x-forwarded-for` (e.g. 1 load balancer) | `TRUSTED_PROXY_HOPS=n` (client = n-th entry from the **right**) |

Never set either when clients can reach the app directly; they would choose their own rate-limit identity. A configured header that
is missing or not exactly one valid IP makes the client "unknown"; it never falls back to `x-forwarded-for`. IPv6 is bucketed by
/64. The same trusted value is what login stores as the session IP (previously the client's own `x-forwarded-for`).
Startup logs a warning in production when neither is set.

## When Redis is down

Protection is never silently dropped.

* `RATE_LIMIT_ON_STORE_FAILURE=memory` (default): the identical policy is enforced by a bounded in-process store. Limits are then
  **per instance** (k instances admit up to k× the limit) and reset on restart; this is logged once (`rate_limit_store_degraded`)
  and again on recovery. A circuit breaker (5 s) stops every request waiting for a Redis timeout.
* `RATE_LIMIT_ON_STORE_FAILURE=deny`: requests to limited endpoints get `503` + `Retry-After` until Redis is back. Choose this if you
  would rather lose sign-ins than run with weaker limits.
* No `REDIS_URL`: the in-process store is used and a warning is logged once. Fine for development; set it in production.

Not changed: the existing per-workspace AI execute limiter (`src/modules/ai/core/rate-limit.ts`) still **fails open** on a Redis
error, by its documented earlier design. It protects spend, not credentials; revisit separately.

## Request bodies

Every route that reads a JSON body calls `readBoundedJson(req, limit)`; a source-scan test fails if any route calls
`req.json()/text()/formData()` directly. The limit is enforced on the bytes actually received while streaming (never on
`Content-Length` alone, never after buffering); a chunked or understated-length body cannot slip through, and reading stops at
the first chunk past the limit.

| Class | Limit | Used by |
|---|---|---|
| `auth` | 8 KiB | login, signup, forgot/reset-password, verify-email (largest legitimate body ≈ 1.2 KB) |
| `publicForm` | 16 KiB | contact, demo-generate |
| `control` | 16 KiB | workspaces create/update, team invites/roles, asset upload initiate/confirm, invite accept |
| `profile` | 64 KiB | business, brand, audience, onboarding (worst legitimate body ≈ 14 k chars ≈ 56 KB at 4 B/char) |
| AI routes | 16 KiB memory, 32 KiB preferences, 1 MiB execute | unchanged |

* `Content-Type` must be `application/json` (or `+json`) in UTF-8 and `Content-Encoding` absent or `identity`: otherwise **415**,
  decided before any byte is read. (Text bodies would let a cross-site HTML form drive a JSON endpoint without a CORS preflight;
  compressed bodies are never expanded.)
* Oversized is **400 `VALIDATION_ERROR` "The request body is too large."**, not 413: that is the contract the AI routes and their tests
  already published, and one contract for all 25 routes beats two. Moving to 413 is one line in `STATUS_BY_CODE` plus the five
  tests that assert it.
* `next.config.js` sets `experimental.middlewareClientMaxBodySize: "4mb"`. Next.js buffers every request that passes middleware and,
  by default, silently keeps only the first **10 MiB**: a 40 MB body reached handlers as a truncated prefix and surfaced as a
  confusing "invalid JSON". The route limits decide acceptance; this only bounds the framework's own buffering.
* Not configured or tested here: limits imposed by a hosting platform, CDN or reverse proxy in front of the app.

## Known limitations

* Fixed windows allow a 2× burst at a window boundary.
* Behind carrier-grade NAT many users share an IP; the generous login IP limit is the compromise.
* `POST /auth/signup` still answers `409` for an existing e-mail, which reveals that the address is registered. Hiding it needs an
  e-mail-first signup flow (a product change); the per-IP and per-address limits only slow bulk enumeration.
* The e-mail sender logs the recipient address on success and failure (`src/lib/email.ts`); the new code never does.
