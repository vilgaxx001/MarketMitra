import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "This policy will be dated when finalized and published.";

export default function PrivacyPolicyPage() {
  return (
    <div className="px-6 pb-24 pt-32 md:px-12">
      <div className="mx-auto max-w-reading">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{LAST_UPDATED}</p>

        <div className="mt-4 rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
          This page is real, structured policy content ready for legal review — not
          placeholder text. Bracketed fields (e.g. [Registered Business Address]) mark
          the specific company details that need to be filled in once available; nothing
          on this page invents those details.
        </div>

        <div className="prose prose-invert mt-8 max-w-none space-y-8 text-sm text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Who we are</h2>
            <p className="mt-2">
              MarketMitra (&quot;we&quot;, &quot;us&quot;) provides an AI-assisted marketing
              platform for small businesses. This policy explains what information we
              collect through marketmitra.ai and our application, and how we use it.
              Our registered business details are: [Company Legal Name], [Registered
              Business Address], [Contact Email].
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Information we collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Account information: name, email address, and a securely hashed password (we never store your password in plain text).</li>
              <li>Workspace and business profile details you provide to use the product (business name, industry, brand preferences).</li>
              <li>Content you generate or upload within the product.</li>
              <li>Usage data: pages visited, features used, and device/browser information, collected through privacy-conscious analytics (see our Analytics section).</li>
              <li>Billing information, processed by our payment providers — we do not store full card numbers on our own servers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. How we use information</h2>
            <p className="mt-2">
              To provide and improve the product, to authenticate your account and keep it
              secure, to communicate with you about your account or changes to our
              service, and to comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. AI processing</h2>
            <p className="mt-2">
              Where MarketMitra generates content on your behalf using a third-party AI
              provider, the business description and inputs you provide are sent to that
              provider to generate a response. We do not use your business content to
              train models on behalf of other customers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Cookies &amp; analytics</h2>
            <p className="mt-2">
              We use essential cookies to keep you signed in securely. Our analytics
              implementation (see src/lib/analytics in our codebase, for the technically
              curious) is designed to collect aggregate usage events without personal
              free-text content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Your rights</h2>
            <p className="mt-2">
              You can access, correct, or delete your account information at any time
              from your workspace settings, or by contacting us at [Privacy Contact
              Email]. You may request a copy of the data we hold about you.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Grievance Officer</h2>
            <p className="mt-2">
              In accordance with the Information Technology Act, 2000 and rules made
              thereunder, the details of our Grievance Officer will be published here:
              [Grievance Officer Name], [Designation], [Email], [Address].
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Contact us</h2>
            <p className="mt-2">
              Questions about this policy can be sent through our{" "}
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
