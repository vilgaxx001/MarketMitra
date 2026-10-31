# E-mail, signup and logging: security behaviour and production checklist

Code: `src/lib/email.ts`, `src/lib/log-redaction.ts`, `src/modules/auth/service.ts` (`assertSignupsEnabled`, `registerAccount`),
`src/app/api/v1/auth/signup/route.ts`, `src/app/api/v1/contact/route.ts`. Rate limits and trusted-proxy configuration: `docs/RATE_LIMITING.md`.
Tests: `src/lib/__tests__/email-security.test.ts`, `src/modules/auth/__tests__/signup-enumeration.test.ts`,
`src/lib/rate-limit/__tests__/routes.test.ts`, and the HTTP suite section "Authentication".

## 1. HTML injection into e-mails

**Before.** Every template interpolated user-controlled text raw: the contact form (anonymous caller → staff inbox), and the verification, reset
and **team-invite** templates (display name, workspace name, inviter name, role). The invite template mails a *third party*, so an inviter could
put markup, links or a look-alike "verify your account" block into a genuine MarketMitra message.

**Now.** Every dynamic value goes through `escapeHtml()` where it enters a template (`& < > " ' \``), multi-line messages through
`escapeHtmlWithBreaks()`, link targets through `safeUrl()` (only absolute http/https, otherwise `#`), and subjects through
`sanitizeHeaderText()` (no CR/LF/control characters). `sendEmail()` sanitises the subject again at the single choke point. The contact route builds
nothing itself: it uses `emailTemplates.contactNotification`. The plain-text alternative is not HTML and is left as typed.

## 2. Signup does not reveal whether an address is registered

**Before.** Existing address → `409 CONFLICT "An account with this email already exists"`; new address → `201`, a `Set-Cookie` session and the user
object. Status, body, headers and timing (bcrypt + insert vs. a lookup) all differed.

**Now.** Every valid request gets the **same** answer: `202`, the same body, **no cookie**. The rest runs after the response (`after()`):

| Address | What happens (out of band) |
|---|---|
| new | account created, verification e-mail sent |
| already registered | nothing changes (no second account, no password change, no token); the **owner** receives "you already have an account" with log-in and reset links |
| lost a unique-index race | treated as "already registered" |

Because the account does not exist at the moment of the response, the user **signs in after signup** (usually within a second or two) instead of
being logged in by the signup call; e-mail verification stays the soft flag it was (nothing in the app enforces it). The sign-up page now says
"Check your email" and links to log-in, instead of claiming "account created".

What can still differ, deliberately: `400` validation errors (about what the caller sent), `429` limits (keyed on what was submitted, identical for new
and existing addresses), `403` when the platform has disabled signups (same for everyone). **Residual:** after 3 submissions of one address in an
hour the next gets `429`, which lets someone use up another person's signup budget for an hour. If the deferred work fails (database or provider
down) the user sees "check your email" and receives nothing; the failure is logged by error name (`signup_registration_failed`) and a retry is safe.
Other places that can reveal membership: team invites (visible only to workspace admins who send them) are unchanged.

## 3. No personal data in logs

* `sendEmail()` logs the provider, the **recipient domain**, a **keyed reference** (HMAC-SHA-256 under `SESSION_SECRET`, 12 hex chars; stable per
  address, so one user's failures correlate and support can recompute it from an address; not reversible) and, on success, the provider **message id**.
  Provider errors are passed through `redactEmailAddresses()` (some echo the recipient) before being logged or re-thrown.
* The contact route logs topic, message length and the same keyed reference; never the name, address or text.
* Signup, forgot-password and the existing-account notice log the error **name** only (`errorName`).
* `pino` redaction now also censors `to`, `email`, `recipient` and their one-level-nested forms, as defence in depth (`src/lib/log-redaction.ts`).

## 4. Production checklist

| Item | Setting |
|---|---|
| Client IP trust | exactly one of `TRUSTED_IP_HEADER` / `TRUSTED_PROXY_HOPS` (app refuses to start otherwise) |
| Shared rate-limit store | `REDIS_URL` (`redis://` or `rediss://`; app refuses to start otherwise) |
| Redis outage behaviour | `RATE_LIMIT_ON_STORE_FAILURE=memory` (default) or `deny` |
| Session / key-hash secret | `SESSION_SECRET` ≥ 32 chars (also keys rate-limit identifiers and the log reference) |
| Mail provider | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` on a domain **verified in Resend** (SPF/DKIM) |
| Contact delivery | `CONTACT_INBOX_EMAIL` (without it submissions are accepted but nothing stores them; boot warns, each one logs `contact_form_not_delivered`) |
| Public URL | `APP_URL` (used in the links inside mails) |

## 5. Verifying real e-mail delivery in staging (`scripts/ops/verify-resend-staging.ts`)

CI cannot do this: it runs with a placeholder key, and the provider answers `401 API key is invalid`, which proves the SDK call shape and error
handling, **not delivery**. Run once per environment, from a shell that has the staging environment loaded:

```
STAGING_TEST_RECIPIENT=you@a-mailbox-you-control.example npx tsx scripts/ops/verify-resend-staging.ts
```

It sends one message through the application's own `sendEmail`, requires the provider message id, polls Resend's API until `last_event` is
`delivered`, and captures the application's real log output to confirm that neither the recipient address, its local part, the API key nor
`SESSION_SECRET` appears in it. It refuses placeholder keys, example domains and missing recipients, and prints only the recipient **domain**.
Exit `0` = delivered and clean; `1` = failed; `2` = refused to run; `3` = accepted but delivery not confirmed in time (check the message id in the
Resend dashboard). Keep the staging key in the staging secret store, never in a file in the repository.
