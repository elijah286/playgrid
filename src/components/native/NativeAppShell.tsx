"use client";

import { useEffect } from "react";
import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import {
  primeOfflineShell,
  registerOfflineServiceWorker,
} from "@/lib/native/registerServiceWorker";
import { installFetchFailureLog } from "@/lib/native/fetchFailureLog";
import { registerPush, unregisterPush } from "@/lib/native/registerPush";
import { registerAppOpen } from "@/lib/native/registerAppOpen";
import {
  isReloadBlocked,
  triggerAppReloadIfNewBuild,
} from "@/lib/native/reloadGuard";
import { createClient } from "@/lib/supabase/client";

// How long the app must have been backgrounded before a return-to-foreground
// triggers a reload. The WebView points at the live site, so reloading picks
// up any deploy that landed while the coach was away. Long enough that a quick
// app-switch (check a text, glance at a notification) never yanks the page out
// from under them; short enough that a real "came back later" gets fresh code.
const RESUME_RELOAD_AFTER_MS = 20 * 60 * 1000; // 20 minutes

export function NativeAppShell() {
  useEffect(() => {
    if (!isNativeApp()) return;

    // FIRST — before anything can fetch. Offline, opening a downloaded play
    // paints the real editor then throws "Load failed" (WebKit's rejected-fetch
    // message, which carries no usable stack, so the error can't name its own
    // cause). This records WHICH request died. Observe-and-rethrow only.
    installFetchFailureLog();

    document.body.classList.add("native-app");
    document.body.classList.add(`native-${nativePlatform()}`);

    // Record this launch for install analytics (open / first-open). Fires on
    // every native start; the authenticated user is attached on sign-in below.
    void registerAppOpen();

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
    // and React hydration. It runs a one-shot launch animation, then rests on
    // the logo + a loading bar.
    //
    // Dismissal adds `.native-ready` to <html>, which fades the overlay out
    // (globals.css). We deliberately do NOT fade it the instant hydration
    // lands — that gave the animation ~zero screen time. Instead: hide the
    // native splash, RESTART the overlay's CSS animations from frame 0 (they
    // began at first paint *behind* the splash, so without this they'd be
    // partway through), then hold the overlay long enough for the play to run
    // before revealing the app. `safetyTimer` is a near backstop if the
    // splash-hide promise never resolves; the inline 8s watchdog in
    // layout.tsx is the outer one.
    const LAUNCH_HOLD_MS = 3600; // ~ the launch animation's length + a beat
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let readyDone = false;
    const markReady = () => {
      if (readyDone || cancelled) return;
      readyDone = true;
      document.documentElement.classList.add("native-ready");
    };
    const safetyTimer = setTimeout(markReady, 6000);

    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        if (cancelled) return;
        await SplashScreen.hide({ fadeOutDuration: 280 });
      } catch {
        /* plugin may be absent or already hidden */
      }
      if (cancelled || readyDone) return;
      // Native splash has lifted — the overlay is now the visible layer.
      // Restart its animations so the play runs from the top, then hold, then
      // reveal the app. Best-effort: if getAnimations() is unavailable or the
      // restart no-ops, the animation simply plays from wherever it is and the
      // hold below still gives it screen time.
      try {
        const overlay = document.getElementById("native-loading-overlay");
        overlay?.querySelectorAll("*").forEach((el) => {
          const anims = (
            el as Element & { getAnimations?: () => Animation[] }
          ).getAnimations?.();
          anims?.forEach((a) => {
            try {
              a.cancel();
              a.play();
            } catch {
              /* ignore a single uncooperative animation */
            }
          });
        });
      } catch {
        /* best-effort */
      }
      hideTimer = setTimeout(markReady, LAUNCH_HOLD_MS);
    })();

    // Reload-on-resume: when the app comes back to the foreground after being
    // away a while, reload so it picks up the latest deploy without the coach
    // needing to know the pull-to-refresh gesture. Guarded (reloadGuard) so it
    // never reloads out from under an active edit or a fullscreen Cal thread.
    let lastHiddenAt = 0;
    let appStateHandle: { remove: () => void } | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            lastHiddenAt = Date.now();
            return;
          }
          if (lastHiddenAt === 0) return;
          const away = Date.now() - lastHiddenAt;
          lastHiddenAt = 0;
          if (away >= RESUME_RELOAD_AFTER_MS && !isReloadBlocked()) {
            // Only reload if a newer deploy is actually live — otherwise the
            // resume re-fetches the bundle for nothing. The probe re-checks
            // the guard before reloading (deployVersion.ts / reloadGuard.ts).
            void triggerAppReloadIfNewBuild();
          }
        });
        if (cancelled) handle.remove();
        else appStateHandle = handle;
      } catch {
        /* @capacitor/app missing (web) — ignore */
      }
    })();

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
      // Re-record the open now that we have a session, so the authenticated
      // user is attached to this install (the mount call may have run while
      // still logged out).
      void registerAppOpen();
      // Re-register the offline SW and prime the shell caches now that a
      // session exists. The mount-time registration runs pre-login on fresh
      // installs and can fail (a redirected /sw.js fetch = SecurityError);
      // login is a client-side nav, so without this retry the first session
      // — the one where a coach downloads playbooks — ends with no offline
      // shell at all. Also re-primes /offline/<id> for playbooks already in
      // IndexedDB whose download-time precache no-oped.
      void primeOfflineShell();
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
      clearTimeout(safetyTimer);
      appStateHandle?.remove();
      teardownPush?.();
      authSub.subscription.unsubscribe();
      document.body.classList.remove("native-app");
      document.body.classList.remove(`native-${nativePlatform()}`);
    };
  }, []);

  return null;
}
