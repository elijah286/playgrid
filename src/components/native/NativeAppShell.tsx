"use client";

import { useEffect } from "react";
import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import { registerOfflineServiceWorker } from "@/lib/native/registerServiceWorker";

export function NativeAppShell() {
  useEffect(() => {
    if (!isNativeApp()) return;

    document.body.classList.add("native-app");
    document.body.classList.add(`native-${nativePlatform()}`);

    // Register the offline shell SW. It precaches /offline so the app can
    // boot without signal; on any navigation failure it redirects there.
    void registerOfflineServiceWorker();

    // If we boot offline (or drop offline while sitting on a network-bound
    // route like /plays/<id>/edit), bounce to /offline so the downloaded
    // playbook viewer is reachable instead of leaving the user on a stalled
    // page. The SW handles fresh navigations; this handles state-change
    // transitions inside an already-loaded session.
    const onOffline = () => {
      const path = window.location.pathname;
      if (path.startsWith("/offline")) return;
      window.location.replace("/offline");
    };
    if (!navigator.onLine) {
      // Defer so we don't fight initial hydration.
      setTimeout(onOffline, 0);
    }
    window.addEventListener("offline", onOffline);

    let cancelled = false;
    (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        if (cancelled) return;
        await StatusBar.setStyle({ style: Style.Light });
      } catch {
        /* plugin missing on web — safe to ignore */
      }
    })();

    // The HTML loading overlay (rendered server-side, gated on .native-shell
    // set in <head> before paint) bridges the gap between the native splash
    // and React hydration. Hide the native splash now — the overlay is
    // already on screen with the logo and progress bar.
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        if (cancelled) return;
        await SplashScreen.hide({ fadeOutDuration: 280 });
      } catch {
        /* plugin may be absent or already hidden */
      }
    })();

    const markReady = () => {
      document.documentElement.classList.add("native-ready");
    };
    if (document.readyState === "complete") {
      markReady();
    } else {
      window.addEventListener("load", markReady, { once: true });
      // Fallback so a hung resource never traps the user behind the overlay.
      hideTimer = setTimeout(markReady, 8000);
    }

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener("load", markReady);
      window.removeEventListener("offline", onOffline);
      document.body.classList.remove("native-app");
      document.body.classList.remove(`native-${nativePlatform()}`);
    };
  }, []);

  return null;
}
