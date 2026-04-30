"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { recordPageViewAction } from "@/app/actions/page-views";
import { recordPageDwellAction } from "@/app/actions/ui-events";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { CLICK_ID_PARAMS, type ClickIds } from "@/lib/attribution/click-ids";

const SESSION_KEY = "playgrid:session-id";
const FIRST_EVENT_KEY = "playgrid:session-first-sent";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function detectDevice(): "mobile" | "tablet" | "desktop" {
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const lastSentRef = useRef<string | null>(null);
  const enteredAtRef = useRef<number>(Date.now());
  const currentPathRef = useRef<string | null>(null);

  // Flush dwell time for the previous path before recording the new one,
  // and again on tab-hide / pagehide. The last dwell flushed during
  // pagehide is also marked is_exit so we know which page ended the
  // session.
  useEffect(() => {
    if (!pathname) return;
    if (isNativeApp()) return;

    if (lastSentRef.current === pathname) return;

    // Page changed: flush dwell for the previous path (not an exit — the
    // user kept browsing).
    if (currentPathRef.current && currentPathRef.current !== pathname) {
      const dwell = Date.now() - enteredAtRef.current;
      void recordPageDwellAction({
        sessionId: getSessionId(),
        path: currentPathRef.current,
        dwellMs: dwell,
        isExit: false,
      });
    }

    lastSentRef.current = pathname;
    currentPathRef.current = pathname;
    enteredAtRef.current = Date.now();

    const sessionId = getSessionId();

    let isFirst = false;
    try {
      if (!sessionStorage.getItem(FIRST_EVENT_KEY)) {
        sessionStorage.setItem(FIRST_EVENT_KEY, "1");
        isFirst = true;
      }
    } catch {
      isFirst = false;
    }

    let referrer: string | null = null;
    let utmSource: string | null = null;
    let utmMedium: string | null = null;
    let utmCampaign: string | null = null;
    let utmContent: string | null = null;
    let utmTerm: string | null = null;
    let landingPath: string | null = null;
    let clickIds: ClickIds | null = null;
    if (isFirst) {
      try {
        referrer = document.referrer || null;
      } catch {
        referrer = null;
      }
      try {
        const q = new URLSearchParams(window.location.search);
        utmSource = q.get("utm_source");
        utmMedium = q.get("utm_medium");
        utmCampaign = q.get("utm_campaign");
        utmContent = q.get("utm_content");
        utmTerm = q.get("utm_term");
        const ids: ClickIds = {};
        for (const k of CLICK_ID_PARAMS) {
          const v = q.get(k);
          if (v) ids[k] = v;
        }
        clickIds = Object.keys(ids).length > 0 ? ids : null;
      } catch {
        // ignore
      }
      landingPath = pathname;
    }

    const device = detectDevice();
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

    void recordPageViewAction({
      sessionId,
      path: pathname,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      landingPath,
      clickIds,
      device,
      userAgent,
      isFirstSessionEvent: isFirst,
    });
  }, [pathname]);

  useEffect(() => {
    if (isNativeApp()) return;
    function flushExit() {
      const path = currentPathRef.current;
      if (!path) return;
      const dwell = Date.now() - enteredAtRef.current;
      void recordPageDwellAction({
        sessionId: getSessionId(),
        path,
        dwellMs: dwell,
        isExit: true,
      });
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flushExit();
    }
    window.addEventListener("pagehide", flushExit);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushExit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
