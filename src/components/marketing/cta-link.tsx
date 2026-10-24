/**
 * src/components/marketing/cta-link.tsx
 *
 * Thin wrapper around the shared Button (asChild + next/link) that fires
 * a typed `cta_click` analytics event before navigating. Every marketing
 * CTA button renders through this component instead of a raw <Link> so
 * click tracking (requirement #11) is structurally guaranteed rather
 * than something each call site has to remember to add.
 */
"use client";

import Link from "next/link";
import { Button, type ButtonProps } from "@/components/ui/button";
import { track } from "@/lib/analytics/track";
import type { MarketingEventMap } from "@/lib/analytics/events";

export interface CtaLinkProps extends Pick<ButtonProps, "variant" | "size" | "className" | "leadingIcon" | "trailingIcon"> {
  href: string;
  cta: string;
  location: MarketingEventMap["cta_click"]["location"];
  destination: MarketingEventMap["cta_click"]["destination"];
  children: React.ReactNode;
}

export function CtaLink({ href, cta, location, destination, children, ...buttonProps }: CtaLinkProps) {
  return (
    <Button asChild {...buttonProps}>
      <Link
        href={href}
        onClick={() => track("cta_click", { cta, location, destination })}
      >
        {children}
      </Link>
    </Button>
  );
}
