/**
 * src/components/marketing/pricing-section.tsx
 *
 * Client Component — the monthly/yearly toggle is real interactive
 * state. Plan data comes from `src/lib/pricing-data.ts` (the abstraction
 * documented there, standing in for Module 8's real billing service).
 *
 * Every plan CTA still routes through real auth (`getMarketingCtaHref`):
 * logged-out visitors go to `/signup` with the chosen plan + interval
 * preserved as query params so the signup flow (or eventually the
 * checkout step Module 8 adds) knows what they picked; logged-in users
 * go straight to their dashboard, since a plan change is a billing
 * action, not a signup action.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MARKETING_PLANS, YEARLY_DISCOUNT_PERCENT } from "@/lib/pricing-data";
import { getMarketingCtaHref } from "@/lib/marketing-cta";
import { track } from "@/lib/analytics/track";

type Interval = "monthly" | "yearly";

export function PricingSection({
  isLoggedIn,
  variant = "full",
}: {
  isLoggedIn: boolean;
  variant?: "full" | "teaser";
}) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const plans = variant === "teaser" ? MARKETING_PLANS.slice(0, 2) : MARKETING_PLANS;

  return (
    <section id="pricing" className="relative z-10 px-6 py-24 md:px-12">
      <div className="mx-auto max-w-content">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-muted-foreground">
            Start free for 7 days. No credit card required. Cancel anytime.
          </p>
        </div>

        <div className="mx-auto mt-8 flex w-fit items-center gap-1 rounded-full border border-border/60 bg-surface-raised/50 p-1">
          {(["monthly", "yearly"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => {
                setInterval(opt);
                track("pricing_interval_toggle", { interval: opt });
              }}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-fast",
                interval === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
              aria-pressed={interval === opt}
            >
              {opt === "monthly" ? "Monthly" : `Yearly (save ${YEARLY_DISCOUNT_PERCENT}%)`}
            </button>
          ))}
        </div>

        <div
          className={cn(
            "mx-auto mt-12 grid max-w-5xl gap-6",
            plans.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"
          )}
        >
          {plans.map((plan) => {
            const priceInPaise = interval === "monthly" ? plan.priceMonthlyINR : Math.round(plan.priceYearlyINR / 12);
            const ctaHref =
              plan.ctaKind === "contact"
                ? "/contact?topic=agency-plan"
                : `${getMarketingCtaHref(isLoggedIn)}${isLoggedIn ? "" : `?plan=${plan.key}&interval=${interval}`}`;

            return (
              <div
                key={plan.key}
                className={cn(
                  "glass relative flex flex-col rounded-xl p-8",
                  plan.highlighted && "border-2 border-secondary shadow-glow-primary"
                )}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">
                    {formatCurrency(priceInPaise, "INR")}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                {interval === "yearly" && (
                  <p className="mt-1 text-xs text-muted-foreground">billed annually</p>
                )}

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.highlighted ? "primary" : "outline"}
                  className="mt-8 w-full"
                >
                  <Link
                    href={ctaHref}
                    onClick={() => track("plan_selected", { planKey: plan.key, interval })}
                  >
                    {isLoggedIn ? "Go to dashboard" : plan.ctaLabel}
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>

        {variant === "teaser" && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Link href="/pricing" className="text-secondary hover:underline">
              See full plan comparison →
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
