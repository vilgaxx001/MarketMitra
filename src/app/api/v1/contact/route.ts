/**
 * src/app/api/v1/contact/route.ts
 *
 * Backs the public /contact form. Real validation, and real delivery to `CONTACT_INBOX_EMAIL` (see src/lib/env.ts) through the
 * existing `sendEmail()` adapter (src/lib/email.ts).
 *
 * UNTRUSTED INPUT: name, email, topic and message come from an anonymous caller and end up in an HTML e-mail that staff open.
 * They are rendered by `emailTemplates.contactNotification`, which HTML-escapes every field (and strips line breaks from the
 * subject); this route never builds markup itself.
 *
 * NO PERSONAL DATA IN LOGS: the submitter's name, address and message are not logged. A log line carries the topic, the message
 * length and a keyed reference to the sender (see src/lib/email.ts). Consequence, stated plainly: when CONTACT_INBOX_EMAIL is
 * NOT configured nothing stores the submission, so the route logs a `contact_form_not_delivered` warning for every one (and
 * src/lib/env.ts warns at boot in production). Configure the inbox before launch.
 */
import { z } from "zod";
import { withApiHandler, apiSuccess, apiValidationError } from "@/lib/api-response";
import { env } from "@/lib/env";
import { sendEmail, emailTemplates, recipientLogFields } from "@/lib/email";
import { logger } from "@/lib/logger";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit, enforceEmailLimit } from "@/lib/rate-limit";

const CONTACT_TOPICS = ["general", "billing", "bug-report", "agency-plan", "press"] as const;

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  topic: z.enum(CONTACT_TOPICS).default("general"),
  message: z.string().trim().min(10).max(2000),
});

export const POST = withApiHandler(async (req) => {
  await enforceIpLimit(req, "contact");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.publicForm);
  if (!parsedBody.ok) return parsedBody.response;
  const result = contactSchema.safeParse(parsedBody.data);
  if (!result.success) return apiValidationError(result.error);

  const { name, email, topic, message } = result.data;
  await enforceEmailLimit("contact", email);

  const sender = recipientLogFields(email);
  logger.info({ msg: "contact_form_submission", topic, messageLength: message.length, senderRef: sender.recipientRef });

  if (env.CONTACT_INBOX_EMAIL) {
    await sendEmail({ ...emailTemplates.contactNotification({ name, email, topic, message }), to: env.CONTACT_INBOX_EMAIL });
  } else {
    logger.warn({ msg: "contact_form_not_delivered", reason: "CONTACT_INBOX_EMAIL is not configured; the submission was not stored", topic, senderRef: sender.recipientRef });
  }

  return apiSuccess({ received: true });
});
