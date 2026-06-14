import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for container deploys (Cloud Run / Fly / etc.).
  // Emits .next/standalone with a minimal node_modules tree.
  output: "standalone",
  // Apple's App Store Server library is server-only (cert-chain / JWS
  // verification); keep it external so Next doesn't bundle it into a route chunk.
  serverExternalPackages: ["@apple/app-store-server-library"],
  images: {
    remotePatterns: [
      {
        // Supabase Storage (playbook-logos bucket and any other storage assets)
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.squarespace-cdn.com",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      // /learn-more was the deep-dive tour page before the tour content
      // was lifted into its own route. Preserve external links and SEO.
      { source: "/learn-more", destination: "/tour", permanent: true },
      // Ad landing redirect — set your ad destination URL to /go so you can
      // change where ads land without touching the campaign in Meta/Reddit/etc.
      // Currently routes to the homepage; swap destination here when needed.
      { source: "/go", destination: "/", permanent: false },
      // Canonicalize on the www host. metadataBase and NEXT_PUBLIC_SITE_URL
      // both point at https://www.xogridmaker.com — a user landing on the
      // apex would otherwise generate RSC prefetches and canonical links
      // pointing at www, which Safari treats as cross-origin and CORS-blocks
      // (visible as "Fetch API cannot load … due to access control checks"
      // in the console). Also dedupes the apex/www split for SEO.
      {
        source: "/:path*",
        has: [{ type: "host", value: "xogridmaker.com" }],
        destination: "https://www.xogridmaker.com/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Force HTML documents to revalidate so browsers (notably Safari)
        // can't pin a stale shell across deploys. Hashed assets under
        // /_next/static remain immutable and are excluded.
        //
        // `no-cache` (not `no-store`) is deliberate: `no-store` opts the
        // page out of Chrome's back/forward cache, so returning to a
        // discarded tab triggers a full middleware + RSC round-trip
        // (auth refresh + DB queries) and stalls for 1–3s. `no-cache`
        // still forces revalidation via ETag, so Safari can't pin a
        // stale shell, but bfcache restores stay instant.
        source: "/:path((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  widenClientFileUpload: true,
});
