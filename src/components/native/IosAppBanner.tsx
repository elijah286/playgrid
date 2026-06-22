"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { track } from "@/lib/analytics/track";
import { APP_STORE_URL, shouldShowIosBanner } from "@/lib/native/appStore";

const DISMISS_KEY = "playgrid:ios-app-banner-dismissed";

/**
 * iOS "Smart App Banner" for the browsers Apple's native banner never reaches.
 * Apple's `apple-itunes-app` meta-tag banner only renders in Mobile Safari, so
 * this covers Chrome / Firefox / Edge / in-app-webview visitors on iPhone &
 * iPad with the same top, in-flow, dismissible bar the Android banner uses.
 *
 * The render decision lives in shouldShowIosBanner() (pure, unit-tested):
 * App Store id configured, native shell excluded, iOS-only, Safari excluded (it
 * gets Apple's native banner), and stays dismissed across sessions. See
 * AppInstallBanner.tsx for the Android sibling.
 */
export function IosAppBanner() {
  // undefined while we decide on mount; avoids a flash before the UA + storage
  // checks run (they require the browser, so they can't run during SSR).
  const [show, setShow] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      dismissed = false;
    }
    const visible = shouldShowIosBanner({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      isNative: isNativeApp(),
      dismissed,
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(visible);
    if (visible) {
      track({ event: "app_banner_view", target: "ios_install_banner" });
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
    track({ event: "app_banner_dismiss", target: "ios_install_banner" });
  }

  return (
    <div
      role="region"
      aria-label="Get the XO Gridmaker iOS app"
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
          Faster on the app — free on the App Store
        </p>
      </div>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          track({ event: "app_banner_click", target: "ios_install_banner" })
        }
        className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
      >
        Get
      </a>
    </div>
  );
}
