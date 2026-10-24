/**
 * src/lib/pricing-data.ts
 *
 * Pricing data abstraction for the marketing site.
 *
 * WHY THIS FILE EXISTS: the `Plan` table (see prisma/schema.prisma) and
 * its real service layer (`src/modules/billing/*`) are Module 8 scope —
 * not built yet. The marketing pricing page still needs real numbers to
 * render *today*, so this file is the single place those numbers live,
 * shaped identically to the future `Plan` DB row (same field names, same
 * paise-based integer pricing used by `formatCurrency()` in
 * `src/lib/utils.ts`) so the swap is mechanical, not a rewrite.
 *
 * TO CONNECT REAL BILLING LATER (Module 8):
 *   1. Build `src/modules/billing/service.ts` with a `listActivePlans()`
 *      function that queries the `Plan` table via a `repository.ts`.
 *   2. In `src/app/(marketing)/pricing/page.tsx` (a Server Component),
 *      replace `import { MARKETING_PLANS } from "@/lib/pricing-data"`
 *      with `const plans = await billingService.listActivePlans()`.
 *   3. Delete this file. No component in `src/components/marketing/`
 *      needs to change — they all consume the `PlanDTO` shape below,
 *      not this file directly.
 *
 * Pricing values are the product's actual intended list prices (set by
 * the business), not a usage or outcome statistic — unlike hardcoded
 * customer counts or satisfaction percentages, these are safe to ship
 * before Module 8 exists because they don't claim anything about real
 * customers or results.
 */

export interface PlanDTO {
  key: "starter" | "growth" | "agency";
  name: string;
  description: string;
  /** Smallest currency unit (paise), matching the Plan.priceMonthlyINR column. */
  priceMonthlyINR: number;
  /** Smallest currency unit (paise), matching the Plan.priceYearlyINR column (billed annually). */
  priceYearlyINR: number;
  maxWorkspaceSeats: number;
  maxGenerationsPerMonth: number | null;
  features: string[];
  highlighted?: boolean;
  ctaLabel: string;
  /** "checkout" routes through signup with a plan preselected; "contact" opens the contact page. */
  ctaKind: "checkout" | "contact";
}

export const YEARLY_DISCOUNT_PERCENT = 30;

export const MARKETING_PLANS: PlanDTO[] = [
  {
    key: "starter",
    name: "Starter",
    description: "For solo owners just getting consistent with marketing.",
    priceMonthlyINR: 99_900,
    priceYearlyINR: 99_900 * 12 * 0.7,
    maxWorkspaceSeats: 1,
    maxGenerationsPerMonth: 50,
    features: [
      "50 AI-generated pieces of content / month",
      "Instagram & Facebook strategy",
      "Basic SEO keyword research",
      "1 marketing calendar / month",
      "Email support",
    ],
    ctaLabel: "Start free trial",
    ctaKind: "checkout",
  },
  {
    key: "growth",
    name: "Growth",
    description: "For businesses ready to run marketing like a full-time function.",
    priceMonthlyINR: 249_900,
    priceYearlyINR: 249_900 * 12 * 0.7,
    maxWorkspaceSeats: 3,
    maxGenerationsPerMonth: null,
    features: [
      "Unlimited AI-generated content",
      "All platforms including WhatsApp & Reels",
      "Full SEO + competitor analysis",
      "Ad copy for Google, Facebook & Instagram",
      "Monthly growth strategy & roadmap",
      "Brand voice customisation",
      "Priority support",
    ],
    highlighted: true,
    ctaLabel: "Start free trial",
    ctaKind: "checkout",
  },
  {
    key: "agency",
    name: "Agency",
    description: "For agencies and consultants managing marketing for multiple clients.",
    priceMonthlyINR: 799_900,
    priceYearlyINR: 799_900 * 12 * 0.7,
    maxWorkspaceSeats: 10,
    maxGenerationsPerMonth: null,
    features: [
      "Manage up to 10 client businesses",
      "White-label reports & exports",
      "API access for custom integrations",
      "Custom brand voice training per client",
      "Dedicated account manager",
      "Team seats included",
    ],
    ctaLabel: "Contact sales",
    ctaKind: "contact",
  },
];

/**
 * Billing gateway selection is by workspace billing country — Razorpay for
 * India, Stripe international — per docs/ARCHITECTURE.md section 6. Not
 * wired yet (Module 8); this constant documents the intended rule so the
 * eventual checkout flow implements it consistently rather than each
 * caller guessing.
 */
export const BILLING_GATEWAY_RULE =
  "Razorpay for workspaces billing from India, Stripe for all other countries.";
