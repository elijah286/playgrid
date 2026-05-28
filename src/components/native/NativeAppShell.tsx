"use client";

import { useEffect } from "react";
import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import { registerOfflineServiceWorker } from "@/lib/native/registerServiceWorker";
import { registerPush, unregisterPush } from "@/lib/native/registerPush";
import { createClient } from "@/lib/supabase/client";

export function NativeAppShell() {
  useEffect(() => {
    if (!isNativeApp()) return;

    document.body.classList.add("native-app");
    document.body.classList.add(`native-${nativePlatform()}`);

    // Register the offline shell SW. It precaches the routes coaches need
    // when there's no signal so the app boots into a usable state instead
    // of `ERR_INTERNET_DISCONNECTED`.
    void registerOfflineServiceWorker();

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

    // Register for push once authenticated. We drive this off
    // onAuthStateChange rather than a mount-time getSession() call: in the
    // native WebView, getSession() races session hydration and often returns
    // null at mount, and SIGNED_IN only fires on the client instance that
    // performed the login (cookie storage doesn't broadcast across instances).
    // onAuthStateChange reliably emits INITIAL_SESSION with the recovered
    // session once storage hydrates — covering "opened while already logged
    // in" — plus SIGNED_IN for fresh logins. A guard makes it idempotent.
    let teardownPush: (() => void) | void;
    let registered = false;
    const supabase = createClient();
    const doRegister = () => {
      if (cancelled || registered) return;
      registered = true;
      void registerPush().then((fn) => {
        if (cancelled) fn?.();
        else teardownPush = fn;
      });
    };
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (
        session &&
        (event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED")
      ) {
        doRegister();
      } else if (event === "SIGNED_OUT") {
        registered = false;
        teardownPush?.();
        teardownPush = undefined;
        void unregisterPush();
      }
    });

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener("load", markReady);
      teardownPush?.();
      authSub.subscription.unsubscribe();
      document.body.classList.remove("native-app");
      document.body.classList.remove(`native-${nativePlatform()}`);
    };
  }, []);

  return null;
}
