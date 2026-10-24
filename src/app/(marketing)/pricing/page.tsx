import type { Metadata } from "next";
import { getCurrentSession } from "@/modules/auth/session";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "MarketMitra pricing for Indian small businesses — Starter, Growth, and Agency plans. 7-day free trial, no credit card required.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const session = await getCurrentSession();
  const isLoggedIn = Boolean(session);

  return (
    <div className="pt-16">
      <PricingSection isLoggedIn={isLoggedIn} variant="full" />
      <FAQ />
    </div>
  );
}
