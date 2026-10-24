/**
 * src/app/layout.tsx
 *
 * Root layout — wraps every route in the application.
 * - Loads Inter via next/font/local (self-hosted file, zero layout shift, no build-time network access).
 * - Mounts <Providers> (theme, tooltip, command palette, toaster).
 * - Sets global <html> attributes (lang, suppressHydrationWarning for
 *   next-themes which injects the "dark" class before hydration).
 * - Registers PWA manifest and core meta tags.
 */
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/layout/providers";
import "@/app/globals.css";

/**
 * Inter (variable, latin) is self-hosted from src/app/fonts so `next build` needs no network access.
 * Licence: SIL OFL 1.1 (src/app/fonts/Inter-OFL-1.1.txt). Previously loaded via next/font/google.
 */
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

/* -------------------------------------------------------------------------
 * Metadata
 * ---------------------------------------------------------------------- */

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    template: "%s | MarketMitra",
    default: "MarketMitra — AI Marketing Employee for Small Businesses",
  },
  description:
    "Generate marketing strategies, social media posts, SEO, ad copies and business growth plans within seconds.",
  keywords: ["AI marketing", "India", "social media", "SEO", "content generation"],
  authors: [{ name: "MarketMitra" }],
  creator: "MarketMitra",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "MarketMitra",
    title: "MarketMitra — AI Marketing Employee for Small Businesses",
    description: "Generate marketing strategies, social media posts, SEO, and ad copies instantly.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MarketMitra — AI Marketing Employee for Small Businesses",
    description: "Generate marketing strategies, social media posts, SEO, and ad copies instantly.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/* -------------------------------------------------------------------------
 * Layout
 * ---------------------------------------------------------------------- */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={inter.variable}
      // Required by next-themes: it patches the class list before React
      // hydrates, and this suppresses the hydration mismatch warning that
      // would otherwise appear because server HTML and client HTML differ
      // for the "dark" class.
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
