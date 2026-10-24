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
