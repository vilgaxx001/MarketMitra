import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="px-6 pb-24 pt-32 md:px-12">
      <div className="mx-auto max-w-reading">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Terms of Service
        </h1>

        <div className="mt-4 rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
          Ready for legal review — bracketed fields mark company-specific details not yet
          finalized. Nothing on this page invents a legal identity or registration number.
        </div>

        <div className="prose prose-invert mt-8 max-w-none space-y-8 text-sm text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Acceptance of terms</h2>
            <p className="mt-2">
              By creating an account or using MarketMitra, you agree to these Terms. If
              you don&apos;t agree, please don&apos;t use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Your account</h2>
            <p className="mt-2">
              You&apos;re responsible for keeping your login credentials secure and for
              activity that happens under your account. Let us know immediately if you
              suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Subscription &amp; billing</h2>
            <p className="mt-2">
              Paid plans renew automatically for the billing period you selected (monthly
              or yearly) until cancelled. You can cancel at any time from your workspace
              billing settings; cancellation takes effect at the end of the current
              billing period. See our{" "}
              <Link href="/refund-policy" className="text-secondary hover:underline">
                Refund Policy
              </Link>{" "}
              for refund terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Acceptable use</h2>
            <p className="mt-2">
              You agree not to use MarketMitra to generate unlawful, infringing, or
              deceptive content, to attempt to abuse or overload our systems (including
              the public demo endpoint), or to resell access without our written consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Content ownership</h2>
            <p className="mt-2">
              You own the content you create using MarketMitra. We claim no ownership
              over your business content, and we don&apos;t use it to train models for
              other customers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Service availability</h2>
            <p className="mt-2">
              We aim for high availability but don&apos;t guarantee the service will be
              uninterrupted or error-free. AI-generated content should be reviewed before
              publishing — MarketMitra is a drafting assistant, not a substitute for your
              own judgment about your business.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Termination</h2>
            <p className="mt-2">
              We may suspend or terminate accounts that violate these Terms. You can
              close your account at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Governing law</h2>
            <p className="mt-2">
              These Terms are governed by the laws of India. Disputes are subject to the
              exclusive jurisdiction of the courts of [Jurisdiction City], India.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Contact</h2>
            <p className="mt-2">
              Questions about these Terms can be sent through our{" "}
              <Link href="/contact" className="text-secondary hover:underline">
                contact page
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
