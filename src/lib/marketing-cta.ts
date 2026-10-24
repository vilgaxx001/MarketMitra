/**
 * src/lib/marketing-cta.ts
 *
 * Single source of truth for "where does this CTA button go" across the
 * marketing site. Every primary/secondary CTA (nav, hero, pricing, final
 * CTA band) resolves its destination through this function rather than
 * hardcoding `/signup` in a dozen components — so requirement #2's
 * "logged-out → signup, logged-in → dashboard" behaviour is guaranteed
 * consistent everywhere, not something each component re-derives.
 *
 * Session state is only knowable server-side (see
 * src/modules/auth/session.ts). Every marketing page/layout that renders
 * a CTA calls `getCurrentSession()` once and passes the resulting
 * `isLoggedIn` boolean down as a prop — see docs/RBAC.md's documented
 * pattern of Client Components receiving pre-resolved booleans rather
 * than resolving auth themselves.
 */

export type CtaIntent = "primary" | "login";

export function getMarketingCtaHref(isLoggedIn: boolean, intent: CtaIntent = "primary"): string {
  if (isLoggedIn) return "/dashboard";
  return intent === "login" ? "/login" : "/signup";
}

export function getMarketingCtaLabel(isLoggedIn: boolean, intent: CtaIntent = "primary"): string {
  if (isLoggedIn) return "Go to dashboard";
  return intent === "login" ? "Log in" : "Start free";
}
