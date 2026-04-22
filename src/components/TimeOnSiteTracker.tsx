"use client";

import { useEffect, useRef } from "react";
import { recordTimeOnSiteAction } from "@/app/actions/time-on-site";

const TIME_ON_SITE_KEY = "playgrid:time-on-site-seconds";
const TICK_SEC = 15;
const FLUSH_EVERY_SEC = 60;

/**
 * Lightweight, layout-level ticker. Accumulates seconds-on-site while the
 * tab is visible, keeps a localStorage mirror for the feedback pill's
 * client-side eligibility check, and flushes a running delta to the
 * profile every minute. Also flushes on pagehide so a closing tab doesn't
 * drop its last partial minute.
 */
export function TimeOnSiteTracker() {
  const unflushedRef = useRef(0);

  useEffect(() => {
    function readLocal(): number {
      try {
        const raw = localStorage.getItem(TIME_ON_SITE_KEY);
        const n = raw ? parseInt(raw, 10) : 0;
        return Number.isFinite(n) ? n : 0;
      } catch {
        return 0;
      }
    }
    function writeLocal(n: number) {
      try {
        localStorage.setItem(TIME_ON_SITE_KEY, String(n));
      } catch {
        /* ignore */
      }
    }
    function flush() {
      const delta = unflushedRef.current;
      if (delta <= 0) return;
      unflushedRef.current = 0;
      void recordTimeOnSiteAction(delta).catch(() => {
        /* best-effort; local mirror already updated */
      });
    }

    const tickId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      unflushedRef.current += TICK_SEC;
      writeLocal(readLocal() + TICK_SEC);
      if (unflushedRef.current >= FLUSH_EVERY_SEC) flush();
    }, TICK_SEC * 1000);

    function onPageHide() {
      flush();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(tickId);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, []);

  return null;
}
