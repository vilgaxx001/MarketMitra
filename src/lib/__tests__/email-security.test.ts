/**
 * E-mail security regressions:
 *   (1) HTML injection: every user-controlled value is escaped in every template (contact notification, verification, reset,
 *       team invite, existing-account notice), and subjects cannot carry line breaks (header injection);
 *   (2) personal data: no log line written by the send path contains a recipient address, successes carry the provider message
 *       id, provider errors that echo an address are redacted, and the redaction config covers address-bearing fields.
 * DOUBLES: env, logger (to read what is logged) and the `resend` SDK. The templates, escaping and logging code are REAL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { LOG_REDACTION } from "@/lib/log-redaction";

const m = vi.hoisted(() => ({ send: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn(), env: {} as Record<string, unknown> }));
vi.mock("@/lib/env", () => ({ env: m.env, isProduction: false }));
vi.mock("@/lib/logger", () => ({ logger: { info: m.info, error: m.error, warn: m.warn, debug: vi.fn() } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: m.send }; } }));

import { escapeHtml, escapeHtmlWithBreaks, sanitizeHeaderText, emailTemplates, sendEmail, redactEmailAddresses, recipientLogFields } from "@/lib/email";

const PAYLOADS = [
  `<script>alert(1)</script>`,
  `"><img src=x onerror=alert(1)>`,
  `' onmouseover='alert(1)`,
  `<a href="https://evil.example/login">Verify your account now</a>`,
  `&lt;already-escaped&gt; & <b>`,
];
// "Dangerous" = an actual element or an attribute that escaped its value. The literal TEXT `onerror=` inside escaped output is harmless
// (it cannot leave the text node because `<`, `>` and quotes are entity-encoded), so it is not matched.
const dangerous = (html: string) => /<script|<img|<b>|<a href="https:\/\/evil|"\s+on\w+\s*=|'\s+on\w+\s*=/i.test(html);

beforeEach(() => {
  [m.send, m.info, m.error, m.warn].forEach((f) => f.mockReset());
  for (const k of Object.keys(m.env)) delete m.env[k];
  Object.assign(m.env, { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_unit_test_key", EMAIL_FROM: "noreply@example.test", SESSION_SECRET: "unit-test-secret-unit-test-secret-1234" });
});

describe("escaping helpers", () => {
  it("escapes the characters that matter in element content and in quoted attributes", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&\``)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;");
  });
  it("keeps line breaks of multi-line messages without allowing markup", () => {
    expect(escapeHtmlWithBreaks("a\r\nb\nc<d>")).toBe("a<br>b<br>c&lt;d&gt;");
  });
  it("header text loses CR/LF/control characters, collapses whitespace and is bounded", () => {
    expect(sanitizeHeaderText("Hello\r\nBcc: attacker@example.test\u0000 x")).toBe("Hello Bcc: attacker@example.test x");
    expect(sanitizeHeaderText("x".repeat(500))).toHaveLength(200);
  });
});

describe("contact notification (anonymous input reaches staff)", () => {
  it.each(PAYLOADS)("neutralises %j in name, email, topic and message", (p) => {
    const t = emailTemplates.contactNotification({ name: p, email: p, topic: p, message: `line1\n${p}` });
    expect(dangerous(t.html)).toBe(false);
    expect(t.html).toContain(escapeHtml(p)); // present, but as entity-encoded text
    if (escapeHtml(p) !== p) expect(t.html).not.toContain(p); // and never in its raw form
    expect(t.html).toContain("<br>"); // only the markup we added
    expect(t.text).toContain(p); // plain text part is not HTML
  });
  it("a subject cannot be split into extra headers", () => {
    const t = emailTemplates.contactNotification({ name: "Ann\r\nBcc: attacker@example.test", email: "a@example.test", topic: "general", message: "hello there friend" });
    expect(t.subject).not.toMatch(/[\r\n]/);
  });
});

describe("transactional templates escape every dynamic value", () => {
  it.each(PAYLOADS)("verify / reset / invite / existing-account with %j", (p) => {
    for (const html of [
      emailTemplates.verifyEmail({ name: p, verificationUrl: "https://app.example.test/verify-email?token=t" }).html,
      emailTemplates.resetPassword({ name: p, resetUrl: "https://app.example.test/reset-password?token=t" }).html,
      emailTemplates.teamInvite({ inviteeName: p, workspaceName: p, inviterName: p, role: p, inviteUrl: "https://app.example.test/invite?token=t" }).html,
      emailTemplates.signupExistingAccount({ name: p, loginUrl: "https://app.example.test/login", resetUrl: "https://app.example.test/forgot-password" }).html,
    ]) expect(dangerous(html)).toBe(false);
  });
  it("the invite subject (it contains the workspace name, and goes to a THIRD PARTY) is a single safe line", () => {
    const t = emailTemplates.teamInvite({ inviteeName: "x", workspaceName: "Acme\r\nBcc: v@example.test", inviterName: "y", role: "ADMIN", inviteUrl: "https://app.example.test/i" });
    expect(t.subject).not.toMatch(/[\r\n]/);
  });
  it("link targets that are not http(s) are neutralised instead of rendered", () => {
    const html = emailTemplates.verifyEmail({ name: "x", verificationUrl: "javascript:alert(1)" }).html;
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).toContain('href="#"');
  });
  it("legitimate names with punctuation survive as readable text", () => {
    const html = emailTemplates.teamInvite({ inviteeName: "x", workspaceName: "Ben & Jerry's \"Co\"", inviterName: "O'Brien", role: "EDITOR", inviteUrl: "https://app.example.test/i" }).html;
    expect(html).toContain("Ben &amp; Jerry&#39;s &quot;Co&quot;");
    expect(html).toContain("O&#39;Brien");
  });
});

describe("sending: no recipient address in logs, provider message id for verification", () => {
  const payload = { to: "Jane.Doe@Example-Mail.test", subject: "Hello", html: "<p>hi</p>", text: "hi" };
  const logged = () => JSON.stringify([...m.info.mock.calls, ...m.error.mock.calls, ...m.warn.mock.calls]);

  it("success: logs the provider message id, the recipient DOMAIN and a keyed reference; never the address", async () => {
    m.send.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const r = await sendEmail(payload);
    expect(r).toEqual({ messageId: "msg_123" });
    const line = m.info.mock.calls[0]![0];
    expect(line).toMatchObject({ msg: "Email sent via Resend", messageId: "msg_123", recipientDomain: "example-mail.test" });
    expect(line.recipientRef).toMatch(/^[0-9a-f]{12}$/);
    expect(logged()).not.toMatch(/jane|doe|Jane\.Doe@/i);
  });
  it("the reference is stable per address (correlation), case-insensitive, and differs per address and per secret", async () => {
    const a = recipientLogFields("Jane.Doe@Example-Mail.test").recipientRef;
    expect(recipientLogFields("jane.doe@example-mail.test").recipientRef).toBe(a);
    expect(recipientLogFields("someone.else@example-mail.test").recipientRef).not.toBe(a);
    m.env.SESSION_SECRET = "a-completely-different-secret-value-0000";
    expect(recipientLogFields("jane.doe@example-mail.test").recipientRef).not.toBe(a);
  });
  it("failure: a provider error that echoes the address is redacted in the log AND in the thrown error", async () => {
    m.send.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field: Jane.Doe@Example-Mail.test is not deliverable" } });
    const err = (await sendEmail(payload).catch((e) => e)) as Error;
    expect(err.message).toContain("[redacted-email]");
    expect(err.message).not.toMatch(/jane|example-mail/i);
    expect(logged()).not.toMatch(/jane|doe@/i);
    expect(m.error.mock.calls[0]![0]).toMatchObject({ msg: "Resend email failed", providerError: { statusCode: 422 }, recipientDomain: "example-mail.test" });
  });
  it("an invalid API key (what CI sees) is reported as such, without any address", async () => {
    m.send.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 401, message: "API key is invalid" } });
    await expect(sendEmail(payload)).rejects.toThrow("Email delivery failed: API key is invalid");
    expect(logged()).not.toMatch(/jane/i);
  });
  it("the subject is made header-safe at the single choke point, whatever the caller passed", async () => {
    m.send.mockResolvedValue({ data: { id: "m" }, error: null });
    await sendEmail({ ...payload, subject: "Hi\r\nBcc: attacker@example.test" });
    expect(m.send.mock.calls[0]![0].subject).not.toMatch(/[\r\n]/);
  });
  it("redactEmailAddresses handles several addresses and leaves other text alone", () => {
    expect(redactEmailAddresses("a.b+c@x.co and d_e@y.org failed: 550")).toBe("[redacted-email] and [redacted-email] failed: 550");
  });
});

describe("logger redaction configuration covers address-bearing fields", () => {
  it("top-level and nested to/email/recipient, and the existing secrets, are censored", () => {
    const lines: string[] = [];
    const log = pino({ redact: LOG_REDACTION }, new Writable({ write(chunk, _e, cb) { lines.push(String(chunk)); cb(); } }));
    log.info({ msg: "x", to: "a@example.test", email: "b@example.test", recipient: "c@example.test", user: { email: "d@example.test" }, ctx: { to: "e@example.test", password: "hunter2", token: "tok" } });
    const out = lines.join("");
    expect(out).not.toMatch(/@example\.test|hunter2|"tok"/);
    expect(out).toContain("[REDACTED]");
  });
});
