"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { track } from "@/lib/analytics/track";

export type InstallPlatform = "ios" | "android";

/** iOS CTA gate, read server-side and passed down from the root layout.
 *  Mirror of `IosInstallCtaConfig` (kept inline so this client module never
 *  imports the server-only config module). */
export type IosInstallCtaProps = {
  enabled: boolean;
  appStoreId: string | null;
};

const DISMISS_KEY: Record<InstallPlatform, string> = {
  android: "playgrid:android-app-banner-dismissed",
  ios: "playgrid:ios-app-banner-dismissed",
};

const ANALYTICS_TARGET: Record<InstallPlatform, string> = {
  android: "android_install_banner",
  ios: "ios_install_banner",
};

const SUBTITLE: Record<InstallPlatform, string> = {
  android: "Faster on the app — free on Google Play",
  ios: "Faster on the app — free on the App Store",
};

const ARIA_LABEL: Record<InstallPlatform, string> = {
  android: "Get the XO Gridmaker Android app",
  ios: "Get the XO Gridmaker iOS app",
};

const PLAY_STORE_APP_ID = "com.xogridmaker.app";

// Append a Play "referrer" so an install from this banner can be attributed
// back to the web click — read post-install via the Play Install Referrer API
// (wired in Phase 2). URLSearchParams encodes the nested referrer string.
export function playStoreUrl(): string {
  const referrer = new URLSearchParams({
    utm_source: "web_banner",
    utm_medium: "app_install_banner",
    utm_campaign: "android_smart_banner",
  }).toString();
  const params = new URLSearchParams({ id: PLAY_STORE_APP_ID, referrer });
  return `https://play.google.com/store/apps/details?${params.toString()}`;
}

/** App Store IDs are numeric; keep only the digits so a pasted "id123" token
 *  or a full apps.apple.com URL still resolves. Returns null when nothing
 *  numeric remains. */
export function normalizeAppStoreId(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

// `ct` is App Store Connect's campaign token — the iOS analog of the Play
// referrer; the install source shows up in App Store Connect → App Analytics.
export function appStoreUrl(appStoreId: string): string {
  const params = new URLSearchParams({ ct: "web_install_banner" });
  return `https://apps.apple.com/app/id${appStoreId}?${params.toString()}`;
}

/** Classify a UA string into the mobile platform whose store we promote, or
 *  null when there's no app to offer (desktop, other mobile OS). */
export function detectMobilePlatform(
  userAgent: string,
  maxTouchPoints: number,
): InstallPlatform | null {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipod|ipad/i.test(userAgent)) return "ios";
  // iPadOS 13+ Safari reports a desktop "Macintosh" UA; a touch-point count
  // above 1 is the standard tell that it's actually an iPad.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return null;
}

export type InstallBannerDecision = {
  platform: InstallPlatform;
  storeUrl: string;
};

/**
 * Pure decision for whether to show the install banner and where it points.
 * All browser access (native check, UA, touch points, localStorage) is passed
 * in so this stays unit-testable. Returns null to hide.
 *
 * Rules:
 *  - Never inside the Capacitor native shell (already in the app).
 *  - Android: always eligible on an Android browser (the Play app is live).
 *  - iOS: eligible only when the Site Admin has flipped the CTA on AND a
 *    numeric App Store ID is configured — keeps it dark until the app ships.
 *  - Never when the coach has dismissed this platform's banner before.
 */
export function resolveInstallBanner(input: {
  isNative: boolean;
  userAgent: string;
  maxTouchPoints: number;
  iosInstallCta: IosInstallCtaProps | undefined;
  isDismissed: (platform: InstallPlatform) => boolean;
}): InstallBannerDecision | null {
  if (input.isNative) return null;

  const platform = detectMobilePlatform(input.userAgent, input.maxTouchPoints);
  if (!platform) return null;

  let storeUrl: string;
  if (platform === "android") {
    storeUrl = playStoreUrl();
  } else {
    const appStoreId = normalizeAppStoreId(input.iosInstallCta?.appStoreId);
    if (!input.iosInstallCta?.enabled || !appStoreId) return null;
    storeUrl = appStoreUrl(appStoreId);
  }

  if (input.isDismissed(platform)) return null;
  return { platform, storeUrl };
}

/**
 * "Smart App Banner": a top, in-flow bar that nudges mobile-web visitors
 * toward the native app. Modeled on iOS's native Smart App Banner convention —
 * it sits above the header, scrolls away with the page, and stays dismissed
 * across sessions.
 *
 * Serves both stores from one render path (matching styles, dismissal, and
 * analytics) rather than relying on Apple's `apple-itunes-app` meta tag, which
 * only fires in Safari and can't be gated by our Site Admin toggle. Android is
 * always on; iOS is gated by `iosInstallCta` until the app is live in the App
 * Store (see ios-install-cta-config.ts).
 */
export function AppInstallBanner({
  iosInstallCta,
}: {
  iosInstallCta?: IosInstallCtaProps;
}) {
  // undefined while we decide on mount (the UA + storage checks require the
  // browser, so they can't run during SSR); null once we've decided to hide.
  const [decision, setDecision] = useState<
    InstallBannerDecision | null | undefined
  >(undefined);

  useEffect(() => {
    const next = resolveInstallBanner({
      isNative: isNativeApp(),
      userAgent: navigator.userAgent,
      maxTouchPoints:
        typeof navigator.maxTouchPoints === "number"
          ? navigator.maxTouchPoints
          : 0,
      iosInstallCta,
      isDismissed: (platform) => {
        try {
          return localStorage.getItem(DISMISS_KEY[platform]) === "1";
        } catch {
          return false;
        }
      },
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecision(next);
    if (next) {
      track({ event: "app_banner_view", target: ANALYTICS_TARGET[next.platform] });
    }
  }, [iosInstallCta]);

  if (!decision) return null;
  const { platform, storeUrl } = decision;

  function dismiss() {
    setDecision(null);
    try {
      localStorage.setItem(DISMISS_KEY[platform], "1");
    } catch {
      /* ignore */
    }
    track({ event: "app_banner_dismiss", target: ANALYTICS_TARGET[platform] });
  }

  return (
    <div
      role="region"
      aria-label={ARIA_LABEL[platform]}
      className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2 print:hidden"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <Image
        src="/brand/xogridmaker_icon.png"
        alt=""
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">
          XO Gridmaker
        </p>
        <p className="truncate text-xs leading-tight text-muted">
          {SUBTITLE[platform]}
        </p>
      </div>
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          track({ event: "app_banner_click", target: ANALYTICS_TARGET[platform] })
        }
        className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
      >
        Open
      </a>
    </div>
  );
}
