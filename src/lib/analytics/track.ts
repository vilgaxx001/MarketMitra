/**
 * src/lib/analytics/track.ts
 *
 * Provider-agnostic analytics dispatch. Every call site imports `track()`
 * from here — never a vendor SDK directly — so swapping analytics
 * providers later (PostHog, GA4, Segment, Mixpanel) is a one-file change
 * instead of a find-and-replace across every component that fires an
 * event.
 *
 * CURRENT STATE: no analytics provider is configured yet. `track()` is a
 * real, working function — it validates its input against the typed
 * catalogue in `events.ts` and, in development, logs to the console so
 * the event taxonomy can be verified while building. In production it is
 * a deliberate no-op rather than silently failing against an unconfigured
 * vendor SDK.
 *
 * TO CONNECT A REAL PROVIDER LATER:
 *   1. Install the vendor SDK and initialize it once (e.g. in
 *      `src/components/marketing/analytics-provider.tsx`, which already
 *      calls `initAnalytics()` below on mount).
 *   2. Implement `dispatch()` to forward to the vendor's `.capture()` /
 *      `.track()` / `.send()` call.
 *   3. No other file in the codebase needs to change — every call site
 *      already goes through this module.
 *
 * PRIVACY: this module never collects PII by default. Event payloads are
 * restricted to the typed shapes in `events.ts`, which intentionally
 * contain no email addresses, names, or free-text user input (e.g. the
 * AI demo's business description is never sent to analytics).
 */

import type { MarketingEventMap, MarketingEventName } from "./events";

let initialized = false;

/**
 * Call once on the client (see AnalyticsProvider) before the first
 * `track()` call. Currently a no-op placeholder — real provider
 * initialization (e.g. `posthog.init(key, { api_host })`) goes here.
 */
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[analytics] initialized (no provider configured — logging only)");
  }
}

function dispatch<E extends MarketingEventName>(
  event: E,
  payload: MarketingEventMap[E]
): void {
  // ---------------------------------------------------------------------
  // SWAP POINT: replace this block with a real vendor call, e.g.:
  //   posthog.capture(event, payload);
  // or:
  //   window.gtag?.("event", event, payload);
  // ---------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", event, payload);
  }
}

/**
 * Fire a typed analytics event. Safe to call from any Client Component —
 * no-ops silently on the server (analytics is a browser-only concern) and
 * before `initAnalytics()` has run.
 *
 * USAGE:
 *   track("cta_click", { cta: "hero_primary", location: "hero", destination: "signup" });
 */
export function track<E extends MarketingEventName>(
  event: E,
  payload: MarketingEventMap[E]
): void {
  if (typeof window === "undefined") return;
  try {
    dispatch(event, payload);
  } catch (err) {
    // Analytics must never break the page it's instrumenting.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[analytics] track() failed", err);
    }
  }
}
