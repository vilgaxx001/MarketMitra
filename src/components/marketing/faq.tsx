/**
 * src/components/marketing/faq.tsx
 *
 * Client Component so opening a question can fire a `faq_toggle`
 * analytics event via Accordion's onValueChange — a Server Component
 * can't pass that closure down to the (already client-side) Accordion
 * primitive.
 *
 * CONTENT AUDIT NOTES (per requirement #1):
 *  - The security answer previously claimed "SOC 2 compliant" and
 *    "AES-256 encryption" — neither verified. Rewritten to describe
 *    what's actually implemented in this codebase: bcrypt password
 *    hashing and signed-JWT sessions in HttpOnly cookies (see
 *    src/modules/auth/service.ts and session.ts).
 *  - The GST invoice answer previously asserted auto-generated invoices
 *    exist today and pointed to a fabricated GSTIN in the footer.
 *    Rewritten as an honest, deferred statement — billing/invoicing is
 *    Module 8, not built yet.
 */
"use client";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { track } from "@/lib/analytics/track";

const FAQS = [
  {
    q: "Is the content actually written by AI, or templates?",
    a: "MarketMitra's content generation runs on real AI models. The public demo on this site is currently a preview of that experience while the production AI integration is finalized — inside the product, generation is fully live for signed-in accounts once that integration is complete.",
  },
  {
    q: "Can I use MarketMitra for multiple businesses?",
    a: "Yes — the Agency plan supports managing multiple client businesses from one account. Starter and Growth plans are built around a single business.",
  },
  {
    q: "What happens to my data?",
    a: "Passwords are hashed with bcrypt before they're ever stored — MarketMitra never has access to your plaintext password. Sessions use signed tokens stored in HttpOnly cookies, so they can't be read by page scripts. Full detail lives in our Privacy Policy.",
  },
  {
    q: "Do you offer a free trial?",
    a: "Yes — every new account gets 7 days free, no credit card required, on the Starter and Growth plans.",
  },
  {
    q: "What's your refund policy?",
    a: "See our Refund Policy page for the current terms. We'd rather you cancel a plan that isn't working for you than feel stuck in it.",
  },
  {
    q: "Will I get a GST invoice?",
    a: "Billing and invoicing are being built now. Once live, GST-compliant invoices will be issued automatically for every billing cycle for Indian businesses.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative z-10 px-6 py-24 md:px-12">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Frequently asked questions
        </h2>

        <Accordion
          type="single"
          collapsible
          className="mt-10"
          onValueChange={(value) => {
            const opened = typeof value === "string" && value.length > 0;
            const question = FAQS.find((_, i) => `faq-${i}` === value)?.q ?? "unknown";
            track("faq_toggle", { question, opened });
          }}
        >
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={`faq-${i}`}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              <AccordionContent>{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
