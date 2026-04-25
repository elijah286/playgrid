"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { recordPageViewAction } from "@/app/actions/page-views";
import { isNativeApp } from "@/lib/native/isNativeApp";

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

  useEffect(() => {
    if (!pathname) return;
    // Skip telemetry inside the Capacitor native shell to keep the iOS/Android
    // builds free of undisclosed analytics for App Store review.
    if (isNativeApp()) return;
    if (lastSentRef.current === pathname) return;
    lastSentRef.current = pathname;

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
      } catch {
        // ignore
      }
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
      device,
      userAgent,
    });
  }, [pathname]);

  return null;
}
