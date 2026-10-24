/**
 * src/app/manifest.ts
 *
 * Next.js App Router PWA manifest — generated as /manifest.json.
 * Enables "Add to Home Screen" on iOS/Android and "Install app"
 * prompt on Chrome desktop, satisfying req #12 (PWA installability).
 *
 * Icons must be placed in /public/icons/ at the sizes listed below.
 * Run `npm run generate:icons` (tool to be added in Module 10) or
 * generate manually via a tool like https://realfavicongenerator.net.
 * See docs/SETUP.md for the full icon generation checklist.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MarketMitra",
    short_name: "MarketMitra",
    description: "AI Marketing Employee for Small Businesses",
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#2563EB",
    orientation: "any",
    categories: ["business", "productivity"],
    lang: "en",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Generate Content",
        url: "/generate",
        description: "Jump straight to AI content generation",
        icons: [{ src: "/icons/shortcut-generate.png", sizes: "96x96" }],
      },
      {
        name: "Dashboard",
        url: "/dashboard",
        description: "Open your workspace dashboard",
        icons: [{ src: "/icons/shortcut-dashboard.png", sizes: "96x96" }],
      },
    ],
    screenshots: [
      {
        src: "/icons/screenshot-dashboard.png",
        type: "image/png",
        sizes: "1280x800",
        form_factor: "wide",
      },
      {
        src: "/icons/screenshot-mobile.png",
        type: "image/png",
        sizes: "390x844",
      },
    ],
  };
}
