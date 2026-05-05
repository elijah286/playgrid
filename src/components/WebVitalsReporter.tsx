"use client";

import { useReportWebVitals } from "next/web-vitals";
import { recordUiEventAction } from "@/app/actions/ui-events";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { getSessionId } from "@/lib/analytics/session-id";

type EffectiveConnection = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

function readConnection(): EffectiveConnection | null {
  try {
    const c = (
      navigator as Navigator & { connection?: EffectiveConnection }
    ).connection;
    if (!c) return null;
    return {
      effectiveType: c.effectiveType,
      downlink: c.downlink,
      rtt: c.rtt,
      saveData: c.saveData,
    };
  } catch {
    return null;
  }
}

/**
 * Streams Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to the ui_events
 * table so the admin analytics views can slice perf by route, device,
 * and connection. Sentry already captures vitals on its 10% trace
 * sample; this gives us 100% coverage in our own DB for the queries we
 * care about (e.g. "p75 LCP on /playbooks/[id] over the last week").
 */
export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (typeof window === "undefined") return;
    if (isNativeApp()) return;

    const path =
      typeof window !== "undefined" ? window.location.pathname : null;
    const conn = readConnection();

    void recordUiEventAction({
      sessionId: getSessionId(),
      eventName: "web_vital",
      path,
      target: metric.name,
      metadata: {
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
        connection: conn,
      },
    });
  });

  return null;
}
