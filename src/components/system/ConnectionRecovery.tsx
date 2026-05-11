"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

// When a tab is backgrounded long enough that the OS likely paused timers
// and half-closed sockets (laptop sleep, mobile app suspended), we need to
// actively re-establish connections on resume. The browser doesn't notice
// dead WebSockets until it tries to send on them, so realtime subscriptions
// silently stall, auth tokens may be expired, and refresh alone doesn't
// recover the page quickly. This component listens for tab/visibility
// transitions and forces:
//   1. A realtime socket reconnect (channels auto-rejoin via supabase-js).
//   2. An auth session refresh so subsequent requests use a fresh JWT.
//
// Also exposes a small diagnostics object on window for in-prod debugging:
//   window.__xoConn.snapshot()    → { isConnected, channels, lastEventAt }
//   window.__xoConn.forceRecover() → run the recovery routine manually
//
// Threshold is generous (30s) so quick alt-tabs are no-ops.

const HIDDEN_THRESHOLD_MS = 30_000;

type Diag = {
  lastHiddenAt: number | null;
  lastVisibleAt: number | null;
  lastRecoveryAt: number | null;
  lastRecoveryHiddenMs: number | null;
  recoveryCount: number;
  snapshot: () => Record<string, unknown>;
  forceRecover: () => Promise<void>;
};

declare global {
  interface Window {
    __xoConn?: Diag;
  }
}

export function ConnectionRecovery() {
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    if (typeof document === "undefined") return;

    const supabase = createClient();
    let hiddenAt: number | null =
      document.visibilityState === "hidden" ? Date.now() : null;
    const state: Pick<
      Diag,
      | "lastHiddenAt"
      | "lastVisibleAt"
      | "lastRecoveryAt"
      | "lastRecoveryHiddenMs"
      | "recoveryCount"
    > = {
      lastHiddenAt: hiddenAt,
      lastVisibleAt: null,
      lastRecoveryAt: null,
      lastRecoveryHiddenMs: null,
      recoveryCount: 0,
    };

    async function recover(hiddenForMs: number, trigger: string) {
      state.recoveryCount += 1;
      state.lastRecoveryAt = Date.now();
      state.lastRecoveryHiddenMs = hiddenForMs;

      // Refresh JWT first so the realtime socket reconnects with a valid
      // token. supabase-js will also wire the new token into realtime via
      // setAuth, but doing it explicitly here makes the order deterministic.
      try {
        await supabase.auth.refreshSession();
      } catch {
        // Refresh failure is non-fatal — the next request will retry, and a
        // truly invalid session will route the user to login through the
        // normal auth flow.
      }

      // Force the realtime socket closed so channels rejoin on a fresh
      // connection. disconnect() is async and resolves once the socket has
      // acknowledged the close (or timed out); connect() opens a new socket
      // and supabase-js re-joins any channels that were in the joined state.
      try {
        const rt = supabase.realtime;
        if (rt.isConnected()) {
          await rt.disconnect();
        }
        rt.connect();
      } catch {
        // If reconnect itself throws, the next user action that touches
        // realtime (sending a message, opening a play) will try again.
      }

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[ConnectionRecovery] recovered", {
          trigger,
          hiddenForMs,
          channels: supabase.realtime.getChannels().length,
        });
      }
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        state.lastHiddenAt = hiddenAt;
        return;
      }

      state.lastVisibleAt = Date.now();
      const startedHiddenAt = hiddenAt;
      hiddenAt = null;
      if (startedHiddenAt === null) return;

      const hiddenForMs = Date.now() - startedHiddenAt;
      if (hiddenForMs < HIDDEN_THRESHOLD_MS) return;

      void recover(hiddenForMs, "visibilitychange");
    }

    // `pageshow` with `persisted: true` fires when the tab is restored from
    // the browser's back-forward cache. Sockets and timers are guaranteed
    // dead in that case — always recover regardless of hidden duration.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void recover(0, "pageshow:bfcache");
      }
    }

    // Mobile (Capacitor) and some desktop browsers fire `focus` without
    // `visibilitychange` when returning from a long-suspended state. Use it
    // as a secondary trigger but only if we already tracked a hidden window.
    function onFocus() {
      if (document.visibilityState !== "visible") return;
      if (hiddenAt === null) return;
      onVisibility();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);

    window.__xoConn = {
      ...state,
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
      snapshot: () => ({
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
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      }),
      forceRecover: () => recover(0, "manual"),
    } as Diag;

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      delete window.__xoConn;
    };
  }, []);

  return null;
}
