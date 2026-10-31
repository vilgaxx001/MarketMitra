/**
 * src/lib/email.ts
 *
 * Email service adapter.
 *
 * Supports two providers (configured via env.EMAIL_PROVIDER):
 *   - "resend": Resend API (recommended, easiest to set up).
 *   - "smtp": any SMTP server (Postmark, SendGrid SMTP, AWS SES, etc.).
 *
 * WHY AN ADAPTER: swapping providers is a one-line env change, not a
 * codebase change. The rest of the application calls `sendEmail()` and
 * never imports Resend or nodemailer directly.
 *
 * PRODUCTION NOTE:
 * Email sending works ONLY when the required env vars are configured
 * (RESEND_API_KEY or SMTP_* credentials). Without them, emails will
 * fail with a clear error rather than silently dropping. See SETUP.md
 * for configuration instructions. This is the "real backend required"
 * boundary referenced in the architecture decision log.
 */

import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/* -------------------------------------------------------------------------
 * Untrusted text
 *
 * Everything a user can type (display name, workspace name, contact message...) reaches an e-mail that somebody else reads
 * in an HTML client. Interpolating it raw lets the author inject markup, links and look-alike "verify your account" blocks
 * into a genuine MarketMitra message (and, via the team-invite template, into mail sent to a THIRD PARTY). So every
 * dynamic value is passed through escapeHtml() at the point it enters a template; the text/plain alternative needs no
 * escaping. Header-bound text (subject) additionally loses CR/LF/control characters.
 * ---------------------------------------------------------------------- */

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

/** Escapes text for use in HTML element content AND double- or single-quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]!);
}

/** Escapes text and keeps line breaks (for multi-line user messages rendered inside a <p>). */
export function escapeHtmlWithBreaks(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

/** A header-safe single line: no CR/LF or other control characters, collapsed whitespace, bounded length. */
export function sanitizeHeaderText(value: string, maxLength = 200): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * A link target for an href: only absolute http(s) URLs are allowed, anything else becomes "#". The templates are fed URLs the
 * server builds, so this is defence in depth against a future caller passing a user-influenced value (javascript:, data:).
 */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? escapeHtml(u.toString()) : "#";
  } catch {
    return "#";
  }
}

/* -------------------------------------------------------------------------
 * Email templates
 * Plain HTML strings rather than a React Email component tree keeps this
 * file self-contained (no server-rendering overhead for transactional
 * email). The templates are styled for email-client compatibility:
 * inline styles, no flexbox, table-based layout.
 * ---------------------------------------------------------------------- */

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#2563EB,#06B6D4);padding:28px 40px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">MarketMitra</p>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7)">AI Marketing Employee for Small Businesses</p>
        </td></tr>
        <tr><td style="padding:40px">${content}</td></tr>
        <tr><td style="padding:20px 40px;background:#f9f9fb;border-top:1px solid #e4e4e7">
          <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6">
            You're receiving this email because you have an account on MarketMitra.<br>
            MarketMitra · India
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const emailTemplates = {
  verifyEmail: (params: { name: string; verificationUrl: string }): EmailPayload => ({
    to: "",
    subject: "Verify your MarketMitra email",
    html: emailWrapper(`
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px">Verify your email</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.7">
        Hi ${escapeHtml(params.name)}, welcome to MarketMitra! Click the button below to verify your email address and activate your account.
      </p>
      <a href="${safeUrl(params.verificationUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1e40af);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px">
        Verify Email Address
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.6">
        This link expires in 24 hours. If you didn't create a MarketMitra account, you can safely ignore this email.
      </p>
      <p style="margin:12px 0 0;font-size:12px;color:#a1a1aa">
        Or copy this link: <span style="color:#2563EB">${escapeHtml(params.verificationUrl)}</span>
      </p>
    `),
    text: `Verify your MarketMitra email\n\nHi ${params.name},\n\nClick this link to verify your email:\n${params.verificationUrl}\n\nThis link expires in 24 hours.`,
  }),

  resetPassword: (params: { name: string; resetUrl: string }): EmailPayload => ({
    to: "",
    subject: "Reset your MarketMitra password",
    html: emailWrapper(`
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.7">
        Hi ${escapeHtml(params.name)}, we received a request to reset your password. Click the button below to set a new one.
      </p>
      <a href="${safeUrl(params.resetUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1e40af);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px">
        Reset Password
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.6">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.
      </p>
    `),
    text: `Reset your MarketMitra password\n\nHi ${params.name},\n\nReset your password here:\n${params.resetUrl}\n\nThis link expires in 1 hour.`,
  }),

  teamInvite: (params: {
    inviteeName: string;
    workspaceName: string;
    inviterName: string;
    role: string;
    inviteUrl: string;
  }): EmailPayload => ({
    to: "",
    subject: sanitizeHeaderText(`You're invited to join ${params.workspaceName} on MarketMitra`),
    html: emailWrapper(`
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px">You're invited!</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.7">
        <strong>${escapeHtml(params.inviterName)}</strong> has invited you to join <strong>${escapeHtml(params.workspaceName)}</strong> on MarketMitra as a <strong>${escapeHtml(params.role)}</strong>.
      </p>
      <a href="${safeUrl(params.inviteUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1e40af);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px">
        Accept Invitation
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.6">
        This invitation expires in 7 days.
      </p>
    `),
    text: `You're invited to join ${params.workspaceName} on MarketMitra.\n\nAccept here: ${params.inviteUrl}`,
  }),
  /** Sent INSTEAD of a verification mail when someone signs up with an address that already has an account (see signup route). */
  signupExistingAccount: (params: { name: string; loginUrl: string; resetUrl: string }): EmailPayload => ({
    to: "",
    subject: "You already have a MarketMitra account",
    html: emailWrapper(`
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px">You already have an account</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.7">
        Hi ${escapeHtml(params.name)}, someone just tried to create a MarketMitra account with this email address, but you already have one.
        If that was you, log in instead. If you've forgotten your password, you can reset it.
      </p>
      <a href="${safeUrl(params.loginUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1e40af);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px">
        Log in
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.6">
        <a href="${safeUrl(params.resetUrl)}" style="color:#2563EB">Reset your password</a>. If this wasn't you, you can safely ignore this email — nothing has changed on your account.
      </p>
    `),
    text: `You already have a MarketMitra account\n\nHi ${params.name},\n\nSomeone just tried to create an account with this email address, but you already have one.\nLog in: ${params.loginUrl}\nForgot your password? ${params.resetUrl}\n\nIf this wasn't you, you can safely ignore this email.`,
  }),

  /** Internal notification of a /contact submission. Every submitted field is untrusted. */
  contactNotification: (params: { name: string; email: string; topic: string; message: string }): EmailPayload => ({
    to: "",
    subject: sanitizeHeaderText(`[MarketMitra Contact — ${params.topic}] ${params.name}`),
    html: `<p><strong>From:</strong> ${escapeHtml(params.name)} (${escapeHtml(params.email)})</p><p><strong>Topic:</strong> ${escapeHtml(params.topic)}</p><p>${escapeHtmlWithBreaks(params.message)}</p>`,
    text: `From: ${params.name} (${params.email})\nTopic: ${params.topic}\n\n${params.message}`,
  }),
};
/* -------------------------------------------------------------------------
 * Logging without personal data
 *
 * Logs are retained, shipped to third parties and read by people who have no business seeing customers' addresses, so no log
 * line written here (or by a caller that logs a thrown send error) contains a recipient address. For operations the log
 * carries what is needed to debug delivery without identifying anyone:
 *   - recipientDomain: "gmail.com" (deliverability problems cluster by receiving domain);
 *   - recipientRef: a keyed, truncated hash of the lower-cased address (HMAC-SHA-256 under SESSION_SECRET, 48 bits). The
 *     same address always yields the same ref, so one user's failures can be correlated and a support agent who is given the
 *     address can recompute it, but the address cannot be recovered from a log and the ref is useless without the secret;
 *   - messageId: the provider's id for the message, which is what you look up in the provider dashboard / API to see delivery.
 * ---------------------------------------------------------------------- */

const EMAIL_PATTERN = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Replaces anything that looks like an e-mail address (provider error messages sometimes echo the recipient). */
export function redactEmailAddresses(text: string): string {
  return text.replace(EMAIL_PATTERN, "[redacted-email]");
}

export function recipientLogFields(to: string): { recipientDomain: string; recipientRef: string } {
  const normalized = to.normalize("NFKC").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  return {
    recipientDomain: at >= 0 ? normalized.slice(at + 1).slice(0, 100) : "unknown",
    recipientRef: createHmac("sha256", env.SESSION_SECRET).update(`email-log\0${normalized}`).digest("hex").slice(0, 12),
  };
}

/* -------------------------------------------------------------------------
 * Send function
 * ---------------------------------------------------------------------- */

export interface SendEmailResult {
  /** The provider's identifier for the accepted message (Resend: data.id, SMTP: messageId). Undefined if the provider returned none. */
  messageId?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  // One choke point: whatever a caller passes, the subject header cannot carry a line break.
  const safe: EmailPayload = { ...payload, subject: sanitizeHeaderText(payload.subject) };
  return env.EMAIL_PROVIDER === "resend" ? sendViaResend(safe) : sendViaSMTP(safe);
}

async function sendViaResend(payload: EmailPayload): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured. Email cannot be sent. See docs/SETUP.md.");
  }

  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  const who = recipientLogFields(payload.to);
  if (error) {
    const message = redactEmailAddresses(String(error.message ?? "unknown error"));
    logger.error({ msg: "Resend email failed", provider: "resend", providerError: { name: error.name, statusCode: error.statusCode, message }, ...who, subject: payload.subject });
    throw new Error(`Email delivery failed: ${message}`);
  }

  const messageId = typeof data?.id === "string" ? data.id : undefined;
  logger.info({ msg: "Email sent via Resend", provider: "resend", messageId, ...who, subject: payload.subject });
  return { messageId };
}

async function sendViaSMTP(payload: EmailPayload): Promise<SendEmailResult> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error(
      "SMTP credentials are not configured (SMTP_HOST, SMTP_USER, SMTP_PASSWORD). See docs/SETUP.md."
    );
  }

  // nodemailer is not in package.json — add it when SMTP is chosen.
  // This gives a clear, actionable error rather than a cryptic module-not-found.
  let nodemailer: typeof import("nodemailer");
  try {
    nodemailer = await import("nodemailer");
  } catch {
    throw new Error(
      'SMTP provider requires nodemailer: run `npm install nodemailer @types/nodemailer`'
    );
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  const who = recipientLogFields(payload.to);
  let info: { messageId?: string };
  try {
    info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  } catch (err) {
    const message = redactEmailAddresses(err instanceof Error ? err.message : String(err));
    logger.error({ msg: "SMTP email failed", provider: "smtp", ...who, subject: payload.subject, errorMessage: message });
    throw new Error(`Email delivery failed: ${message}`);
  }

  const messageId = typeof info.messageId === "string" ? info.messageId : undefined;
  logger.info({ msg: "Email sent via SMTP", provider: "smtp", messageId, ...who, subject: payload.subject });
  return { messageId };
}
