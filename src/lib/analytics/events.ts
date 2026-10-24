/**
 * src/lib/analytics/events.ts
 *
 * The full catalogue of marketing-site analytics events, typed so a call
 * site like `track("cta_click", { cta: "hero_primary" })` is checked at
 * compile time against both the event name and its expected payload shape.
 *
 * WHY A CATALOGUE INSTEAD OF FREE-FORM STRINGS:
 * Untyped analytics ("just call `track('Clicked Button')` anywhere") is how
 * event taxonomies rot — inconsistent naming, missing properties, no way to
 * grep for every place an event fires. Centralizing the list here means
 * adding a new event is a one-line addition to `MarketingEvent`, reviewable
 * in one file, and autocompletion prevents typos in event names.
 *
 * This file has ZERO dependency on any specific analytics vendor — see
 * `track.ts` for the provider-agnostic dispatch function that consumes
 * these types.
 */

export interface MarketingEventMap {
  /** Fires once per marketing-site page view. */
  page_view: { path: string; referrer?: string };

  /** Any primary/secondary CTA button click (nav, hero, pricing, final CTA). */
  cta_click: {
    cta: string;
    location: "nav" | "hero" | "pricing" | "final_cta" | "demo" | "footer";
    /** Whether the click resolved to the signup flow or the dashboard (already logged in). */
    destination: "signup" | "login" | "dashboard";
  };

  /** User followed a nav link (desktop or mobile menu). */
  nav_click: { label: string };

  /** Pricing plan interval toggle (monthly/yearly). */
  pricing_interval_toggle: { interval: "monthly" | "yearly" };

  /** A specific plan's CTA was clicked from the pricing section. */
  plan_selected: { planKey: string; interval: "monthly" | "yearly" };

  /** Pricing section/page entered the viewport. */
  pricing_viewed: { location: "home_teaser" | "pricing_page" };

  /** Any interaction with the AI demo form (field focus, output toggle, submit). */
  demo_interaction: {
    action: "field_focus" | "output_toggle" | "tone_select" | "submit";
    field?: string;
  };

  /** FAQ item expanded. */
  faq_toggle: { question: string; opened: boolean };

  /** Contact form submitted. */
  contact_submit: { topic: string };
}

export type MarketingEventName = keyof MarketingEventMap;
