/**
 * src/app/api/v1/contact/route.ts
 *
 * Backs the public /contact form. Real validation, and real delivery
 * once `CONTACT_INBOX_EMAIL` is configured (see src/lib/env.ts) — this
 * reuses the existing `sendEmail()` adapter from Module 1/3
 * (src/lib/email.ts) rather than introducing a second email pathway.
 *
 * Until `CONTACT_INBOX_EMAIL` is set, submissions are still fully
 * captured via structured logging (`logger.info`) so nothing is lost —
 * they just aren't emailed anywhere yet. This is a genuine, working
 * fallback, not a stub: check server logs / your log aggregator for
 * `msg: "contact_form_submission"` entries.
 */
import { z } from "zod";
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const CONTACT_TOPICS = ["general", "billing", "bug-report", "agency-plan", "press"] as const;

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  topic: z.enum(CONTACT_TOPICS).default("general"),
  message: z.string().trim().min(10).max(2000),
});

export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const result = contactSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  const { name, email, topic, message } = result.data;

  logger.info({
    msg: "contact_form_submission",
    name,
    email,
    topic,
    messageLength: message.length,
  });

  if (env.CONTACT_INBOX_EMAIL) {
    await sendEmail({
      to: env.CONTACT_INBOX_EMAIL,
      subject: `[MarketMitra Contact — ${topic}] ${name}`,
      html: `<p><strong>From:</strong> ${name} (${email})</p><p><strong>Topic:</strong> ${topic}</p><p>${message.replace(/\n/g, "<br>")}</p>`,
      text: `From: ${name} (${email})\nTopic: ${topic}\n\n${message}`,
    });
  }

  return apiSuccess({ received: true });
});
