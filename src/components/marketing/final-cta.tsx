/**
 * src/components/marketing/final-cta.tsx
 *
 * NOTE ON REMOVED CONTENT: previously read "Join 10,000+ Indian
 * businesses growing with MarketMitra" — an unverified, likely
 * fabricated count. Replaced with honest, aspirational copy that makes
 * no factual claim about current customer numbers.
 */
import { CtaLink } from "@/components/marketing/cta-link";
import { getMarketingCtaHref, getMarketingCtaLabel } from "@/lib/marketing-cta";

export function FinalCTA({ isLoggedIn }: { isLoggedIn: boolean }) {
  const ctaHref = getMarketingCtaHref(isLoggedIn);
  const ctaLabel = getMarketingCtaLabel(isLoggedIn);

  return (
    <section className="relative z-10 px-6 py-24 text-center md:px-12">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          Ready to put your marketing on autopilot?
        </h2>
        <p className="mt-4 text-muted-foreground">
          Start free. No credit card required. Cancel anytime.
        </p>
        <div className="mt-8 flex justify-center">
          <CtaLink
            href={ctaHref}
            cta={ctaLabel}
            location="final_cta"
            destination={isLoggedIn ? "dashboard" : "signup"}
            size="lg"
          >
            {ctaLabel} {!isLoggedIn && "→"}
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
