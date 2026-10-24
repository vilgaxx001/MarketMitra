import type { Metadata } from "next";
import { getCurrentSession } from "@/modules/auth/session";
import { Hero } from "@/components/marketing/hero";
import { ProblemSection } from "@/components/marketing/problem-section";
import { FeatureBento } from "@/components/marketing/feature-bento";
import { TestimonialsSection } from "@/components/marketing/testimonials-section";
import { DemoPreviewTeaser } from "@/components/marketing/demo-preview-teaser";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";
import { FinalCTA } from "@/components/marketing/final-cta";

export const metadata: Metadata = {
  title: "AI Marketing Assistant for Indian Small Businesses",
  alternates: { canonical: "/" },
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MarketMitra",
  url: "https://marketmitra.ai",
  description:
    "MarketMitra is an AI marketing assistant for Indian small businesses, generating Instagram strategy, SEO keywords, ad copy, and growth roadmaps.",
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I use MarketMitra for multiple businesses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — the Agency plan supports managing multiple client businesses from one account.",
      },
    },
    {
      "@type": "Question",
      name: "Do you offer a free trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — every new account gets 7 days free, no credit card required, on the Starter and Growth plans.",
      },
    },
  ],
};

export default async function MarketingHomePage() {
  const session = await getCurrentSession();
  const isLoggedIn = Boolean(session);

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      <Hero isLoggedIn={isLoggedIn} />
      <ProblemSection />
      <FeatureBento />
      <TestimonialsSection />
      <DemoPreviewTeaser />
      <PricingSection isLoggedIn={isLoggedIn} variant="teaser" />
      <FAQ />
      <FinalCTA isLoggedIn={isLoggedIn} />
    </>
  );
}
