"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { track } from "@/lib/analytics/track";

const DISMISS_KEY = "playgrid:android-app-banner-dismissed";
const PLAY_STORE_APP_ID = "com.xogridmaker.app";

// Append a Play "referrer" so an install from this banner can be attributed
// back to the web click — read post-install via the Play Install Referrer API
// (wired in Phase 2). URLSearchParams encodes the nested referrer string.
function playStoreUrl(): string {
  const referrer = new URLSearchParams({
    utm_source: "web_banner",
    utm_medium: "app_install_banner",
    utm_campaign: "android_smart_banner",
  }).toString();
  const params = new URLSearchParams({ id: PLAY_STORE_APP_ID, referrer });
  return `https://play.google.com/store/apps/details?${params.toString()}`;
}

/**
 * Android-only "Smart App Banner": a top, in-flow bar that nudges mobile-web
 * visitors toward the Play Store app. Modeled on iOS's native Smart App Banner
 * convention — it sits above the header, scrolls away with the page, and stays
 * dismissed across sessions.
 *
 * Only renders when ALL hold:
 *  - not inside the Capacitor native shell (no point promoting the app to
 *    someone already in it),
 *  - the device is an Android browser (UA sniff — Capacitor reports "web" for
 *    a mobile browser, so platform detection alone won't catch this),
 *  - the coach hasn't dismissed it before.
 *
 * Android only for now — iOS gets Apple's native Smart App Banner via an
 * `apple-itunes-app` meta tag (add that when the iOS app is live), not this
 * component.
 */
export function AppInstallBanner() {
  // undefined while we decide on mount; avoids a flash before the UA + storage
  // checks run (they require the browser, so they can't run during SSR).
  const [show, setShow] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (isNativeApp()) {
      setShow(false);
      return;
    }
    const isAndroid = /android/i.test(navigator.userAgent);
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      dismissed = false;
    }
    const visible = isAndroid && !dismissed;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(visible);
    if (visible) {
      track({ event: "app_banner_view", target: "android_install_banner" });
    }
  }, []);

  if (show !== true) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    track({ event: "app_banner_dismiss", target: "android_install_banner" });
  }

  return (
    <div
      role="region"
      aria-label="Get the XO Gridmaker Android app"
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
          Faster on the app — free on Google Play
        </p>
      </div>
      <a
        href={playStoreUrl()}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          track({ event: "app_banner_click", target: "android_install_banner" })
        }
        className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
      >
        Open
      </a>
    </div>
  );
}
