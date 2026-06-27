"use client";

import Image from "next/image";
import { ChevronRight, X } from "lucide-react";

/**
 * Shared presentational shell for the in-browser "get the app" banners
 * (<IosAppBanner> / <AppInstallBanner>). The two used to be byte-identical
 * muted bars that blended into the site chrome; this is the single, louder
 * surface both render through so they can't drift.
 *
 * Loud by design: a full-width branded (primary) bar with a high-contrast
 * white pill CTA, a slide-down entrance, and a one-shot button sheen to draw
 * the eye without nagging. Still in-flow + dismissible.
 */
export function AppBannerShell({
  ariaLabel,
  blurb,
  ctaLabel,
  ctaHref,
  onCtaClick,
  onDismiss,
}: {
  ariaLabel: string;
  blurb: string;
  ctaLabel: string;
  ctaHref: string;
  onCtaClick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className="app-banner-pop flex items-center gap-3 border-b border-primary-dark/40 bg-gradient-to-r from-primary to-primary-hover px-3 py-2.5 text-white shadow-sm print:hidden"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X className="size-4" />
      </button>
      <Image
        src="/brand/xogridmaker_icon.png"
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-xl ring-1 ring-white/30"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight">
          XO Gridmaker
        </p>
        <p className="truncate text-xs font-medium leading-tight text-white/85">
          {blurb}
        </p>
      </div>
      <a
        href={ctaHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onCtaClick}
        className="app-banner-cta group inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-5 py-2 text-sm font-extrabold text-primary shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0"
      >
        {ctaLabel}
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}
