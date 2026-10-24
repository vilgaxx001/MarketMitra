/**
 * src/components/marketing/hero.tsx
 *
 * Server Component — no client-side JS beyond what its children (the AI
 * core visual, the CTA link) individually need. `isLoggedIn` is resolved
 * once, server-side, by the marketing layout and threaded down as a
 * plain prop.
 *
 * NOTE ON REMOVED CONTENT: the previous version of this section showed
 * animated counters — "10,000+ businesses", "40+ hours saved/month",
 * "95% satisfaction" — with no data source behind them. Those are gone.
 * The floating tags below describe what the product *does* (verifiable
 * from the feature set itself), not unverified outcomes.
 */
import { AICoreVisual } from "@/components/marketing/ai-core-visual";
import { CtaLink } from "@/components/marketing/cta-link";
import { getMarketingCtaHref, getMarketingCtaLabel } from "@/lib/marketing-cta";

const FLOATING_TAGS = [
  { label: "Instagram Strategy", className: "left-[2%] top-[18%] xl:left-[8%]" },
  { label: "SEO Keywords", className: "right-[0%] top-[8%] xl:right-[6%]" },
  { label: "WhatsApp Campaigns", className: "left-[0%] bottom-[16%] xl:left-[4%]" },
  { label: "Ad Copy", className: "right-[2%] bottom-[24%] xl:right-[10%]" },
];

export function Hero({ isLoggedIn }: { isLoggedIn: boolean }) {
  const ctaHref = getMarketingCtaHref(isLoggedIn);
  const ctaLabel = getMarketingCtaLabel(isLoggedIn);

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16 md:px-12">
      <div className="relative z-10 mx-auto flex max-w-content flex-col items-center gap-10 lg:flex-row lg:justify-between">
        <div className="max-w-xl text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface-raised/50 px-4 py-1.5 text-xs font-medium text-secondary">
            <span className="size-1.5 rounded-full bg-secondary" />
            AI Marketing Employee for Small Businesses
          </span>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl xl:text-6xl">
            Your marketing,{" "}
            <span className="bg-gradient-to-br from-secondary via-primary to-accent bg-clip-text text-transparent">
              handled by AI
            </span>
          </h1>

          <p className="mt-6 text-lg text-muted-foreground">
            MarketMitra plans your content, writes your posts, and builds your growth
            strategy — so running marketing for your business feels like having a
            full-time marketing hire, without the full-time cost.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
            <CtaLink
              href={ctaHref}
              cta={ctaLabel}
              location="hero"
              destination={isLoggedIn ? "dashboard" : "signup"}
              size="lg"
            >
              {ctaLabel} {!isLoggedIn && "→"}
            </CtaLink>
            <CtaLink
              href="/demo"
              cta="Try the live demo"
              location="hero"
              destination={isLoggedIn ? "dashboard" : "signup"}
              variant="outline"
              size="lg"
            >
              Try the demo
            </CtaLink>
          </div>

          {!isLoggedIn && (
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card required · 7-day free trial
            </p>
          )}
        </div>

        <div className="relative flex w-full max-w-md items-center justify-center lg:max-w-lg">
          {FLOATING_TAGS.map((tag) => (
            <span
              key={tag.label}
              aria-hidden="true"
              className={`glass absolute hidden rounded-full px-3 py-1.5 text-xs font-medium text-foreground/90 shadow-md md:block ${tag.className}`}
            >
              {tag.label}
            </span>
          ))}
          <AICoreVisual />
        </div>
      </div>
    </section>
  );
}
