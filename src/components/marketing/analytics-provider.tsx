/**
 * src/components/marketing/analytics-provider.tsx
 *
 * Mounted once in the marketing layout. Initializes the analytics module
 * (see src/lib/analytics/track.ts) and fires a `page_view` event on every
 * route change within the marketing site. Renders nothing.
 */
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, track } from "@/lib/analytics/track";

export function AnalyticsProvider() {
  const pathname = usePathname();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current) {
      initAnalytics();
      hasInitialized.current = true;
    }
    track("page_view", {
      path: pathname,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
