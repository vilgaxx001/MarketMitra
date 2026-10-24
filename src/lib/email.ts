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
        Hi ${params.name}, welcome to MarketMitra! Click the button below to verify your email address and activate your account.
      </p>
      <a href="${params.verificationUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1e40af);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px">
        Verify Email Address
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.6">
        This link expires in 24 hours. If you didn't create a MarketMitra account, you can safely ignore this email.
      </p>
      <p style="margin:12px 0 0;font-size:12px;color:#a1a1aa">
        Or copy this link: <span style="color:#2563EB">${params.verificationUrl}</span>
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
        Hi ${params.name}, we received a request to reset your password. Click the button below to set a new one.
      </p>
      <a href="${params.resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1e40af);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px">
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
    subject: `You're invited to join ${params.workspaceName} on MarketMitra`,
    html: emailWrapper(`
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px">You're invited!</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.7">
        <strong>${params.inviterName}</strong> has invited you to join <strong>${params.workspaceName}</strong> on MarketMitra as a <strong>${params.role}</strong>.
      </p>
      <a href="${params.inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1e40af);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px">
        Accept Invitation
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.6">
        This invitation expires in 7 days.
      </p>
    `),
    text: `You're invited to join ${params.workspaceName} on MarketMitra.\n\nAccept here: ${params.inviteUrl}`,
  }),
};

/* -------------------------------------------------------------------------
 * Send function
 * ---------------------------------------------------------------------- */

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (env.EMAIL_PROVIDER === "resend") {
    await sendViaResend(payload);
  } else {
    await sendViaSMTP(payload);
  }
}

async function sendViaResend(payload: EmailPayload): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured. Email cannot be sent. See docs/SETUP.md.");
  }

  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  if (error) {
    logger.error({ msg: "Resend email failed", error, to: payload.to, subject: payload.subject });
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  logger.info({ msg: "Email sent via Resend", to: payload.to, subject: payload.subject });
}

async function sendViaSMTP(payload: EmailPayload): Promise<void> {
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

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  logger.info({ msg: "Email sent via SMTP", to: payload.to, subject: payload.subject });
}
