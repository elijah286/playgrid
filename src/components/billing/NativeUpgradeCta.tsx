"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { nativePlatform } from "@/lib/native/isNativeApp";
import { getIapClientConfig } from "@/app/actions/iap";

/** Race the enabled-check against a timeout. The check is a server action that
 *  can hang on a flaky WebView connection; without this, an upgrade CTA stuck
 *  in "loading" renders nothing and the whole gate looks like a dead end. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/**
 * Native (iOS) "Upgrade to Coach" entry point — the DOOR to the IAP purchase UI.
 * Renders a tap target that navigates to /pricing (where NativeIapPanel runs the
 * StoreKit purchase) ONLY on iOS when IAP is enabled. On web it renders nothing
 * (web has its own data-web-only upgrade CTAs). When IAP is off it renders
 * `fallback` (e.g. the neutral "not available in this app" text), so behavior is
 * unchanged before launch.
 *
 * Without this, the upgrade surfaces all said "plan changes aren't available in
 * this app" and /pricing was unreachable on native — i.e. the IAP UI existed but
 * had no door, which is both a dead end for coaches and a 3.1.1 rejection risk.
 */
export function NativeUpgradeCta({
  label = "Upgrade to Coach",
  variant = "link",
  fallback = null,
  className,
}: {
  label?: string;
  variant?: "link" | "button";
  fallback?: ReactNode;
  /** Full class override for the enabled tap target — lets callers match the
   *  exact web CTA they sit next to (inline banner pill, compact button, etc.).
   *  When provided it wins over `variant`. */
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "enabled" | "disabled" | "web">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (nativePlatform() !== "ios") {
        if (!cancelled) setState("web");
        return;
      }
      try {
        const cfg = await withTimeout(getIapClientConfig(), 6000);
        if (!cancelled) setState(cfg.enabled ? "enabled" : "disabled");
      } catch {
        // The enabled-check hung / failed (flaky server action in the WebView).
        // Don't hide the upgrade path because of it — assume enabled so the CTA
        // stays actionable. A genuine `enabled:false` still hits the line above.
        if (!cancelled) setState("enabled");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "enabled") {
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
  if (state === "disabled") return <>{fallback}</>;
  return null; // web or still loading
}

/**
 * Upgrade destination for a whole-element tap target (e.g. a locked tile): the
 * caller wires the returned href onto a wrapping <Link>. "/pricing" on web
 * (always) and on iOS when IAP is enabled; null on iOS before launch — so the
 * surrounding element stays inert and shows no upgrade affordance (App Store
 * 3.1.1) — and while the config is still loading.
 */
export function useUpgradeHref(): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (nativePlatform() !== "ios") {
      setHref("/pricing");
      return;
    }
    withTimeout(getIapClientConfig(), 6000)
      .then((c) => {
        if (!cancelled) setHref(c.enabled ? "/pricing" : null);
      })
      .catch(() => {
        // Hung / failed — keep the locked tile actionable rather than inert.
        if (!cancelled) setHref("/pricing");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return href;
}
