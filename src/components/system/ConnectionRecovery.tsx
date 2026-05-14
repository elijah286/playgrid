"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

// When a tab is backgrounded long enough that the OS likely paused timers
// and half-closed sockets (laptop sleep, mobile app suspended), we need to
// actively re-establish connections on resume. The browser doesn't notice
// dead WebSockets until it tries to send on them, so realtime subscriptions
// silently stall, auth tokens may be expired, and refresh alone doesn't
// recover the page quickly.
//
// Recovery is harder than "fire once on resume" in practice because Safari
// (and to a lesser extent Chrome) lies about network availability for
// several seconds after wake — fetch fails with "Load failed / The Internet
// connection appears to be offline" and WebSockets refuse to open, even
// though the actual network is fine. So we:
//   1. Retry the recovery routine with exponential backoff so we eventually
//      hit a window where the network stack has caught up.
//   2. Listen for the `online` event and re-trigger when the browser
//      finally admits it's back online.
//   3. Recover on visibilitychange, pageshow (bfcache), and focus to cover
//      all the suspend/resume paths across Safari / Chrome / Capacitor.
//
// Diagnostics on window.__xoConn for in-prod debugging.

const HIDDEN_THRESHOLD_MS = 30_000;
const RETRY_DELAYS_MS = [0, 1_000, 2_500, 5_000, 10_000, 20_000];

type AttemptOutcome = {
  at: number;
  trigger: string;
  attempt: number;
  authOk: boolean;
  realtimeOk: boolean;
  error?: string;
};

type Diag = {
  lastHiddenAt: number | null;
  lastVisibleAt: number | null;
  lastRecoveryAt: number | null;
  lastRecoveryHiddenMs: number | null;
  recoveryCount: number;
  recoveryRunning: boolean;
  attempts: AttemptOutcome[];
  snapshot: () => Record<string, unknown>;
  forceRecover: () => Promise<void>;
};

declare global {
  interface Window {
    __xoConn?: Diag;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export function ConnectionRecovery() {
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    if (typeof document === "undefined") return;

    const supabase = createClient();
    let hiddenAt: number | null =
      document.visibilityState === "hidden" ? Date.now() : null;
    let inFlight = false;
    let aborted = false;

    const state: Pick<
      Diag,
      | "lastHiddenAt"
      | "lastVisibleAt"
      | "lastRecoveryAt"
      | "lastRecoveryHiddenMs"
      | "recoveryCount"
      | "recoveryRunning"
      | "attempts"
    > = {
      lastHiddenAt: hiddenAt,
      lastVisibleAt: null,
      lastRecoveryAt: null,
      lastRecoveryHiddenMs: null,
      recoveryCount: 0,
      recoveryRunning: false,
      attempts: [],
    };

    async function tryRefreshAuth(): Promise<boolean> {
      try {
        const { error } = await supabase.auth.refreshSession();
        return !error;
      } catch {
        return false;
      }
    }

    async function tryReconnectRealtime(): Promise<boolean> {
      try {
        const rt = supabase.realtime;
        if (rt.isConnected()) {
          await rt.disconnect();
        }
        rt.connect();
        // We can't await the new socket reaching OPEN directly without
        // touching internals, so treat "connect() didn't throw" as a soft
        // success. The next attempt in the backoff loop will catch a still-
        // closed socket via isConnected() === false on its check.
        return true;
      } catch {
        return false;
      }
    }

    async function recover(hiddenForMs: number, trigger: string) {
      if (inFlight) return;
      inFlight = true;
      state.recoveryRunning = true;
      state.recoveryCount += 1;
      state.lastRecoveryAt = Date.now();
      state.lastRecoveryHiddenMs = hiddenForMs;

      try {
        // Auth needs to come first — realtime authenticates with the JWT.
        // Both can fail repeatedly during Safari's post-wake "offline"
        // window, so we walk a backoff schedule until either both succeed
        // or we exhaust attempts. Aborting if the document hides again
        // mid-recovery (user switched away).
        let authOk = false;
        let realtimeOk = false;
        for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
          if (aborted) break;
          const delay = RETRY_DELAYS_MS[i];
          if (delay > 0) await sleep(delay);
          if (aborted) break;

          if (!authOk) authOk = await tryRefreshAuth();
          if (authOk) realtimeOk = await tryReconnectRealtime();

          const realtimeStillOpen = supabase.realtime.isConnected();
          const attempt: AttemptOutcome = {
            at: Date.now(),
            trigger,
            attempt: i + 1,
            authOk,
            realtimeOk: realtimeOk && realtimeStillOpen,
          };
          state.attempts.push(attempt);
          if (state.attempts.length > 20) state.attempts.shift();

          if (authOk && realtimeStillOpen) break;
        }

        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info("[ConnectionRecovery] done", {
            trigger,
            hiddenForMs,
            attempts: state.attempts.slice(-RETRY_DELAYS_MS.length),
          });
        }
      } finally {
        inFlight = false;
        state.recoveryRunning = false;
      }
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        state.lastHiddenAt = hiddenAt;
        aborted = true;
        return;
      }

      aborted = false;
      state.lastVisibleAt = Date.now();
      const startedHiddenAt = hiddenAt;
      hiddenAt = null;
      if (startedHiddenAt === null) return;

      const hiddenForMs = Date.now() - startedHiddenAt;
      if (hiddenForMs < HIDDEN_THRESHOLD_MS) return;

      void recover(hiddenForMs, "visibilitychange");
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        aborted = false;
        void recover(0, "pageshow:bfcache");
      }
    }

    function onFocus() {
      if (document.visibilityState !== "visible") return;
      if (hiddenAt === null) return;
      onVisibility();
    }

    function onOnline() {
      // Browser admitted it's back on the network. If recovery had already
      // run and may have failed during the post-wake offline window, kick
      // it again now that fetch should succeed.
      aborted = false;
      void recover(0, "online");
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    window.__xoConn = {
      get lastHiddenAt() {
        return state.lastHiddenAt;
      },
      get lastVisibleAt() {
        return state.lastVisibleAt;
      },
      get lastRecoveryAt() {
        return state.lastRecoveryAt;
      },
      get lastRecoveryHiddenMs() {
        return state.lastRecoveryHiddenMs;
      },
      get recoveryCount() {
        return state.recoveryCount;
      },
      get recoveryRunning() {
        return state.recoveryRunning;
      },
      get attempts() {
        return state.attempts.slice();
      },
      snapshot: () => ({
        navigatorOnLine:
          typeof navigator !== "undefined" ? navigator.onLine : null,
        isConnected: supabase.realtime.isConnected(),
        channels: supabase.realtime.getChannels().map((c) => ({
          topic: c.topic,
          state: c.state,
        })),
        lastHiddenAt: state.lastHiddenAt,
        lastVisibleAt: state.lastVisibleAt,
        lastRecoveryAt: state.lastRecoveryAt,
        lastRecoveryHiddenMs: state.lastRecoveryHiddenMs,
        recoveryCount: state.recoveryCount,
        recoveryRunning: state.recoveryRunning,
        attempts: state.attempts.slice(),
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      }),
      forceRecover: () => {
        aborted = false;
        return recover(0, "manual");
      },
    } as Diag;

    return () => {
      aborted = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      delete window.__xoConn;
    };
  }, []);

  return null;
}
