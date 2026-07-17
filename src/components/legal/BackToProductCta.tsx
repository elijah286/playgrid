import Link from "next/link";

/**
 * In-content CTA shown at the top of the /privacy and /terms pages.
 *
 * Why it exists: telemetry (2026-07) showed /privacy is the #3 landing page —
 * ~85 sessions/mo, ~99% logged-out, 100% single-page bounce, all direct with no
 * referrer. That signature is the App Store / Play Store listing's required
 * "Privacy Policy" link: product-curious people vetting the app land on a bare
 * legal wall with no path into the product and leave. The global SiteHeader
 * logo isn't pulling them in, so we offer an explicit "try it" path in-context.
 *
 * Success metric: /privacy sessions that advance to a 2nd page (was 0/85).
 */
export function BackToProductCta() {
  return (
    <div className="mb-10 flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-foreground">
          The AI-native playbook for flag &amp; youth football coaches
        </p>
        <p className="mt-0.5 text-sm text-muted">
          Design plays, get instant coaching from Cal, and print wristbands —
          free to start.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
      >
        Try the free play designer →
      </Link>
    </div>
  );
}
