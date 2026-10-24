/**
 * src/components/marketing/footer.tsx
 *
 * Every link here resolves to a real route (see src/app/(marketing)/*).
 * No dead "#" links, and — per the audit requirement — no fabricated
 * GSTIN/CIN/registration numbers. Real company registration details
 * belong here once they exist; until then this section is simply
 * omitted rather than filled with invented values.
 */
import Link from "next/link";

const FOOTER_SECTIONS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Live Demo", href: "/demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact us", href: "/contact" },
      { label: "Help centre", href: "/help" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund-policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border/60 px-6 py-16 md:px-12">
      <div className="mx-auto grid max-w-content grid-cols-2 gap-10 md:grid-cols-5">
        <div className="col-span-2">
          <span className="text-lg font-bold tracking-tight bg-gradient-to-br from-white to-secondary bg-clip-text text-transparent">
            MarketMitra
          </span>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            An AI marketing assistant for Indian small businesses — built for Bharat&apos;s
            businesses, from Mumbai to Mysore.
          </p>
        </div>

        {FOOTER_SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
            <ul className="mt-4 space-y-3">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 max-w-content border-t border-border/60 pt-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} MarketMitra. All rights reserved.
      </div>
    </footer>
  );
}
