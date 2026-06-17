"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useNativePlatform } from "@/lib/native/useIsNativeApp";

/**
 * Native (iOS) "Upgrade to Coach" entry point — the DOOR to the IAP purchase UI.
 * Renders a tap target that navigates to /pricing (where NativeIapPanel runs the
 * StoreKit purchase) on iOS. On web it renders nothing (web has its own
 * data-web-only upgrade CTAs).
 *
 * IAP is always on now (the old enabled kill-switch was removed), so iOS always
 * gets the live door — no more "had no door" dead end / 3.1.1 risk. The
 * `fallback` prop is retained only for call-site compatibility and is never
 * rendered.
 */
export function NativeUpgradeCta({
  label = "Upgrade to Coach",
  variant = "link",
  className,
}: {
  label?: string;
  variant?: "link" | "button";
  /** @deprecated IAP is always enabled now — retained for call-site
   *  compatibility; never rendered. */
  fallback?: ReactNode;
  /** Full class override for the tap target — lets callers match the exact web
   *  CTA they sit next to (inline banner pill, compact button, etc.). When
   *  provided it wins over `variant`. */
  className?: string;
}) {
  // Resolves to "web" during SSR + first paint (renders nothing), then flips to
  // the real platform post-mount — avoids a hydration mismatch.
  const platform = useNativePlatform();

  if (platform === "ios") {
    if (className) {
      return (
        <Link href="/pricing" className={className}>
          {label}
        </Link>
      );
    }
    if (variant === "button") {
      return (
        <Link
          href="/pricing"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          {label}
          <span aria-hidden>→</span>
        </Link>
      );
    }
    return (
      <Link href="/pricing" className="font-semibold text-primary underline-offset-2 hover:underline">
        {label}
      </Link>
    );
  }
  return null; // web or still loading
}

/**
 * Upgrade destination for a whole-element tap target (e.g. a locked tile): the
 * caller wires the returned href onto a wrapping <Link>. "/pricing" everywhere —
 * iOS lands on the StoreKit panel, web on the Stripe pricing. (Was gated on the
 * IAP kill-switch and needed an effect to avoid a hydration mismatch; with the
 * gate gone the value is constant.) Kept as a hook so call sites don't change.
 */
export function useUpgradeHref(): string | null {
  return "/pricing";
}
