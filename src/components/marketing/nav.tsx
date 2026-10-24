/**
 * src/components/marketing/nav.tsx
 *
 * Sticky navigation for the marketing site. Client Component because it
 * tracks scroll position (to intensify the glass background once the
 * hero scrolls past) and mobile menu open/close state — both genuine
 * interactivity, not decoration. `isLoggedIn` is resolved server-side by
 * the marketing layout and passed in as a plain boolean prop (see
 * src/lib/marketing-cta.ts).
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CtaLink } from "@/components/marketing/cta-link";
import { getMarketingCtaHref, getMarketingCtaLabel } from "@/lib/marketing-cta";
import { track } from "@/lib/analytics/track";

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Live Demo", href: "/demo" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
];

export function Nav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const ctaHref = getMarketingCtaHref(isLoggedIn);
  const ctaLabel = getMarketingCtaLabel(isLoggedIn);

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 top-0 z-sticky flex h-16 items-center justify-between px-6 transition-colors duration-base md:px-12",
          scrolled ? "glass" : "bg-transparent border-b border-transparent"
        )}
      >
        <Link
          href="/"
          className="text-lg font-bold tracking-tight bg-gradient-to-br from-white via-white to-secondary bg-clip-text text-transparent"
          onClick={() => track("nav_click", { label: "Home (logo)" })}
        >
          MarketMitra
        </Link>

        <ul className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
                onClick={() => track("nav_click", { label: link.label })}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {!isLoggedIn && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login" onClick={() => track("nav_click", { label: "Log in" })}>
                Log in
              </Link>
            </Button>
          )}
          <CtaLink
            href={ctaHref}
            cta={ctaLabel}
            location="nav"
            destination={isLoggedIn ? "dashboard" : "signup"}
            size="sm"
          >
            {ctaLabel} {!isLoggedIn && "→"}
          </CtaLink>
        </div>

        <button
          className="flex size-9 items-center justify-center rounded-md text-foreground lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        className={cn(
          "fixed inset-0 z-modal glass flex flex-col items-center justify-center gap-6 transition-opacity duration-base lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-lg font-medium text-foreground"
            onClick={() => {
              track("nav_click", { label: link.label });
              setMobileOpen(false);
            }}
          >
            {link.label}
          </Link>
        ))}
        {!isLoggedIn && (
          <Link
            href="/login"
            className="text-lg font-medium text-muted-foreground"
            onClick={() => setMobileOpen(false)}
          >
            Log in
          </Link>
        )}
        <CtaLink
          href={ctaHref}
          cta={ctaLabel}
          location="nav"
          destination={isLoggedIn ? "dashboard" : "signup"}
          size="lg"
        >
          {ctaLabel}
        </CtaLink>
      </div>
    </>
  );
}
