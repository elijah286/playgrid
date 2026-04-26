"use client";

import { useEffect } from "react";
import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import { NativeOfflineLink } from "./NativeOfflineLink";

/**
 * Mounts native-only side effects (status bar style, body class) when the
 * page is running inside the Capacitor wrapper. On the web this is a no-op.
 *
 * The `native-app` body class lets CSS hide web-only chrome (marketing
 * footer, install banners) and add safe-area padding without prop drilling.
 */
export function NativeAppShell() {
  useEffect(() => {
    if (!isNativeApp()) return;

    document.body.classList.add("native-app");
    document.body.classList.add(`native-${nativePlatform()}`);

    let cancelled = false;
    (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        if (cancelled) return;
        await StatusBar.setStyle({ style: Style.Light });
      } catch {
        // Plugin missing on web — safe to ignore.
      }
    })();

    // Cross-fade the native splash to the first hydrated paint. We wait
    // one rAF so the React tree has rendered before the splash drops —
    // otherwise reviewers see a flash of white between splash and content.
    (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        await SplashScreen.hide({ fadeOutDuration: 280 });
      } catch {
        /* ignore — plugin may be absent or the native shell already hid it */
      }
    })();

    return () => {
      cancelled = true;
      document.body.classList.remove("native-app");
      document.body.classList.remove(`native-${nativePlatform()}`);
    };
  }, []);

  return <NativeOfflineLink />;
}
