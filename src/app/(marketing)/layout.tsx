/**
 * src/app/(marketing)/layout.tsx
 *
 * Root of the public marketing site. A Server Component: it resolves
 * the session ONCE here via `getCurrentSession()` and passes a plain
 * `isLoggedIn` boolean down to Nav/Hero/Pricing/FinalCTA, rather than
 * each of those re-deriving auth state independently.
 *
 * DARK-BY-DEFAULT: the marketing site keeps its cinematic dark identity
 * regardless of the visitor's OS/app theme preference — scoping `.dark`
 * to this layout (rather than relying on the global next-themes toggle)
 * preserves that intentional design decision without touching the
 * app-wide ThemeProvider that the authenticated dashboard depends on.
 * Every color used across the marketing components still resolves
 * through the same CSS variables as the rest of the app (tokens.css) —
 * this only pins *which* value of those variables applies here.
 */
import type { Metadata } from "next";
import { getCurrentSession } from "@/modules/auth/session";
import { Nav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { ParticleBackground } from "@/components/marketing/particle-background";
import { CursorGlow } from "@/components/marketing/cursor-glow";
import { AnalyticsProvider } from "@/components/marketing/analytics-provider";

export const metadata: Metadata = {
  title: {
    default: "MarketMitra — India's AI Marketing Employee for Small Businesses",
    template: "%s | MarketMitra",
  },
  description:
    "MarketMitra plans, writes, and manages your marketing — Instagram, SEO, ad copy, and WhatsApp campaigns — so small businesses can grow without hiring a full marketing team.",
  openGraph: {
    type: "website",
    siteName: "MarketMitra",
    title: "MarketMitra — India's AI Marketing Employee for Small Businesses",
    description:
      "AI-generated Instagram strategy, SEO keywords, ad copy, and growth roadmaps — built for Indian small businesses.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MarketMitra — India's AI Marketing Employee for Small Businesses",
    description:
      "AI-generated Instagram strategy, SEO keywords, ad copy, and growth roadmaps — built for Indian small businesses.",
  },
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  const isLoggedIn = Boolean(session);

  return (
    <div className="dark relative min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <ParticleBackground />
      <CursorGlow />
      <AnalyticsProvider />

      <Nav isLoggedIn={isLoggedIn} />
      <main id="main-content" className="relative z-10">
        {children}
      </main>
      <Footer />
    </div>
  );
}
