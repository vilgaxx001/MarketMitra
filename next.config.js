/**
 * next.config.js
 *
 * - Security headers applied globally (req #18 — security).
 * - `images.remotePatterns` restricted to our own S3 bucket + known AI
 *   provider asset domains — never wildcarded.
 * - Strict mode on for React 19 concurrent-safety checks during development.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "4mb", // accommodates logo uploads handled via Server Actions
    },
    // Next.js buffers the body of every request that passes middleware (all /api routes except webhooks) and keeps only the
    // first 10 MiB by default, truncating silently. 4 MiB matches the Server Actions limit above and is larger than any JSON
    // route's own cap (src/lib/bounded-json.ts BODY_LIMITS, AI execute 1 MiB), so legitimate requests are unaffected while the
    // framework's buffering of an oversized body is bounded. The per-route limits, not this, decide what is accepted.
    middlewareClientMaxBodySize: "4mb",
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Webhook routes must never be cached or framed
        source: "/api/webhooks/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },

  async redirects() {
    return [];
  },
};

module.exports = nextConfig;
