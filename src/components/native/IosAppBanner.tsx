"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { track } from "@/lib/analytics/track";
import { APP_STORE_URL, shouldShowIosBanner } from "@/lib/native/appStore";
import { AppBannerShell } from "@/components/native/AppBannerShell";

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
    <AppBannerShell
      ariaLabel="Get the XO Gridmaker iOS app"
      blurb="Faster on the app — free on the App Store"
      ctaLabel="Get the app"
      ctaHref={APP_STORE_URL}
      onCtaClick={() =>
        track({ event: "app_banner_click", target: "ios_install_banner" })
      }
      onDismiss={dismiss}
    />
  );
}
