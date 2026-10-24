import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund Policy",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <div className="px-6 pb-24 pt-32 md:px-12">
      <div className="mx-auto max-w-reading">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Refund Policy
        </h1>

        <div className="mt-4 rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
          Billing itself isn&apos;t live yet (see our{" "}
          <Link href="/pricing" className="underline">
            pricing page
          </Link>{" "}
          for status) — this policy describes the terms that will apply once it is, so
          it&apos;s published and reviewable ahead of launch rather than written after
          the fact.
        </div>

        <div className="prose prose-invert mt-8 max-w-none space-y-8 text-sm text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Free trial</h2>
            <p className="mt-2">
              New accounts on Starter and Growth plans get a 7-day free trial. You
              won&apos;t be charged during the trial, and you can cancel anytime before
              it ends at no cost.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">14-day refund window</h2>
            <p className="mt-2">
              If you&apos;re on a paid plan and it isn&apos;t working for your business,
              you can request a full refund within 14 days of your first charge. After
              14 days, charges for the current billing period are non-refundable, but
              you can cancel to prevent future renewals.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">How to request a refund</h2>
            <p className="mt-2">
              Contact us through our{" "}
              <Link href="/contact" className="text-secondary hover:underline">
                contact page
              </Link>{" "}
              with your account email and the reason for your request. We aim to process
              eligible refunds within 5–7 business days to your original payment method.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Plan changes &amp; downgrades</h2>
            <p className="mt-2">
              Downgrading takes effect at the end of your current billing period — we
              don&apos;t issue partial refunds for the unused portion of a higher-tier
              plan.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
