# Rate limiting and request-body limits

Code: `src/lib/rate-limit/` (policy, client-ip, store, limiter, index) and `src/lib/bounded-json.ts`.
Tests: `src/lib/rate-limit/__tests__/` (unit tests, tests against a real Redis, and route-level tests of the real handlers), `src/lib/__tests__/bounded-json.test.ts`,
`src/lib/__tests__/route-body-guard.test.ts`, and the HTTP suite section "Public-endpoint rate limits, body bounds and
forgot-password deferral" (`scripts/http-verification/run.mjs`).

## What is limited

The **unauthenticated** endpoints, which have no session to throttle by, and AI execution (per workspace, because that is what is
billed). Other authenticated routes are bounded by their session and permission checks.

| Endpoint | Per client IP (before the body is read) | Per identifier |
|---|---|---|
| `POST /auth/login` | 60 **failed** attempts / 15 min (a successful login refunds its attempt) | 5 / 15 min per **account + IP**, cleared by a successful login; 20 / hour per **account** counting only IPs that have not logged in to it within 30 days |
| `POST /auth/signup` | 10 / hour | 3 / hour per e-mail → `429` |
| `POST /auth/forgot-password` | 10 / hour | 3 / hour per e-mail → the **same 200**, nothing sent |
| `POST /auth/reset-password` | 30 / hour | none (see below) |
| `POST /auth/verify-email` | 30 / hour | none |
| `POST /contact` | 10 / hour | 3 / hour per e-mail → `429` |
| `POST /ai/demo-generate` | 20 / hour | none |
| `POST /workspaces/:slug/ai/execute` | none | 20 / minute per **workspace** → `429` + `Retry-After` (key `aiExecution.workspace`) |

These are conservative **starting points, not measured optima**. Tune them from real traffic. Every one can be overridden
without a code change through `RATE_LIMIT_POLICY_JSON`, a strict JSON object validated at boot (unknown keys, zero, negatives,
fractions, and values above 10 000 requests or 7 days are refused and the app does not start):

```
RATE_LIMIT_POLICY_JSON={"login":{"ip":{"max":60}},"contact":{"email":{"windowSeconds":7200}}}
```

Why these numbers: a person mistyping needs a handful of attempts, an online guesser thousands, so 5 per account+IP per 15
minutes makes a 10⁶-guess list take years from one address. IP limits for login are high because offices and mobile carriers
share addresses. Signup, forgot-password and contact send mail or create rows and have no legitimate burst. Reset and verify
tokens carry 286 bits of entropy, so the per-IP limit exists to stop cheap probing, not to protect the secret; there is
deliberately no per-token limit, because a guesser changes the token on every request and would get a fresh counter each time.

## How a limit works

* **Exact sliding windows (a log of admitted requests).** Each counter stores the timestamps of the requests it *admitted* in the
  last `windowSeconds`. A request is admitted only if fewer than `max` are inside that window; a refused request records nothing.
  Consequences, each covered by tests (unit, real Redis, real HTTP): at most `max` requests are admitted in **any** interval of one
  window length (the earlier fixed-window design admitted up to 2× `max` within milliseconds across a window boundary: 40 requests
  against a limit of 20, measured); refused requests cannot extend a block, so hammering a blocked endpoint does not keep anyone
  locked out; and `Retry-After` is exact (the moment the oldest admitted request leaves the window). Cost: memory is O(`max`) per
  counter (a few hundred entries with the default policy), which is why `max` is capped at 10 000.
* **Atomic under concurrency, with Redis time.** Pruning, counting and recording are one Lua script, and the same script sets the key's
  expiry (`PEXPIRE` = one window) on every admission, so no counter ever exists without an expiry and there is no check-then-record
  gap: with a limit of 5, exactly 5 of 40 parallel logins reach the password check, from one or several app instances. Time comes
  from Redis (`TIME`), so instances with skewed clocks agree.
* **One response for every limit.** `429 RATE_LIMITED`, the same message whichever counter tripped, `Retry-After` = seconds until a
  slot frees, `Cache-Control: no-store`. A response never says whether an account exists or which limit was hit.
* **Keys hold no e-mail.** Identifiers are normalised (NFKC, trimmed, lower-cased, so look-alike forms share one counter) and keyed
  with HMAC-SHA-256 under `SESSION_SECRET`, truncated to 128 bits. Logs carry the endpoint and the scope that tripped, nothing
  else, at most once per minute per endpoint+scope.

### Shared addresses (CGNAT, offices, campuses)

One IPv4 address can be thousands of people, so a per-IP limit is never the control that protects an individual. The strict,
per-person controls are keyed on the **account / e-mail**; the per-IP limits are flood ceilings sized for a busy shared address:

* **Login:** the per-IP counter holds **failed** logins only (a success refunds its admission). A credential-stuffing run is almost all
  failures and is stopped at 60 per 15 minutes per address; a shared address full of legitimate users is almost all successes and is
  not throttled by its neighbours' good logins (verified over HTTP: 65 successful logins from one address, then 61 failed ones, which
  are stopped at the 61st). One person mistyping is limited per account+IP, so the neighbours are unaffected.
* **Signup, forgot-password, contact:** the IP ceilings (10 / hour) sit above the per-address limit (3 / hour); the per-address limit is
  what protects an inbox.
* **Reset / verify:** 30 / hour per IP; tokens carry 286 bits of entropy, the limit only stops cheap probing.
* **What this does not do:** it cannot tell apart two *different* people who both fail logins or both sign up from one address; a very large
  carrier-grade NAT can still reach the signup ceiling at busy times. If that happens in production, raise the ceiling for that
  endpoint with `RATE_LIMIT_POLICY_JSON` (e.g. `{"signup":{"ip":{"max":60}}}`) and put a challenge (CAPTCHA / proof of work) in front
  of signup rather than lowering the per-address controls. A cookie or User-Agent as an extra key was considered and rejected: an
  attacker simply omits it, so it adds no protection and only complicates the key space.

### Login lockout without permanent denial of service

Every block ends by itself at a known time (refused attempts are not recorded, so they cannot extend it). The brute-force counter is keyed on **account + IP**, so an attacker blocking
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
**The app refuses to start in production without one** (see *Production configuration* below).

## Production configuration (validated at boot)

`src/lib/env.ts` checks these when `NODE_ENV=production` and the process **does not start** if they are missing:

| Variable | Requirement |
|---|---|
| `TRUSTED_IP_HEADER` **or** `TRUSTED_PROXY_HOPS` | Exactly one, matching the deployment (table above). Both set is rejected (the header would silently win). `x-forwarded-for` / `forwarded` are rejected as `TRUSTED_IP_HEADER` (clients can prepend to them: use `TRUSTED_PROXY_HOPS`). A deliberate no-proxy deployment must say so with `RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP=true` (loud warning at boot; all clients then share one bucket per endpoint). |
| `REDIS_URL` | `redis://` or `rediss://`. Without it limits are per instance and reset on restart (k instances = k× the limit, including the AI cost limit). A deliberate single-instance deployment must say so with `RATE_LIMIT_ALLOW_MEMORY_STORE=true`. |
| `RATE_LIMIT_ON_STORE_FAILURE` | `memory` (default) or `deny`; see below. |
| `RATE_LIMIT_POLICY_JSON` | Optional; strict and validated (an invalid value stops the app). |
| `CONTACT_INBOX_EMAIL` | Not fatal, but warned about at boot: without it contact-form submissions are accepted and **not delivered or stored** (personal data is deliberately not logged). |

Ambiguous or forgeable client-IP settings are reported in every environment (a warning outside production, a refusal in production).
The CI release gate runs the real production build with `TRUSTED_IP_HEADER=x-real-ip` and a real Redis, so these checks execute on every run.

## When Redis is down

Protection is never silently dropped, for the public endpoints **and** for AI execution (which used to fail open: unlimited paid provider
calls whenever `REDIS_URL` was unset or Redis errored).

* `RATE_LIMIT_ON_STORE_FAILURE=memory` (default): the identical policy is enforced by a bounded in-process store. Limits are then
  **per instance** (k instances admit up to k× the limit; for AI that bounds worst-case spend at k × 20 calls / minute / workspace) and
  reset on restart; this is logged once (`rate_limit_store_degraded`) and again on recovery. A circuit breaker (5 s) stops every request
  waiting for a Redis timeout.
* `RATE_LIMIT_ON_STORE_FAILURE=deny`: requests to limited endpoints get `503` + `Retry-After` until Redis is back, and AI execution is
  refused with `503 SERVICE_UNAVAILABLE` (internal code `RATE_LIMITER_UNAVAILABLE`). Choose this if you would rather lose sign-ins and AI
  generation than run with weaker limits or unbounded cost.
* Any unexpected error from the limiter itself refuses the AI call (fail closed) and logs only the error name and workspace id.
* No `REDIS_URL` (development, or production with the explicit acknowledgement): the in-process store is used and a warning is logged once.

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

* The sliding window bounds admissions per window, not the instantaneous rate: all `max` requests may arrive in one burst, and in memory
  mode (Redis down) each instance has its own window.
* Behind carrier-grade NAT many users share an IP; see *Shared addresses* for what is and is not protected.
* A signup address that has been submitted 3 times in an hour answers `429` to the next attempt, whether or not it is registered. That is
  keyed on what was submitted, so it reveals nothing about the account, but it does let someone burn another person's signup budget for
  an hour (the owner of an existing account does not need to sign up).
* Contact-form submissions are only delivered by e-mail; with no `CONTACT_INBOX_EMAIL` nothing stores them.
* Not tested here: limits imposed by a hosting platform, CDN or reverse proxy in front of the app, and real traffic volumes.
