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

// Sample rate for web_vital writes. Set to 0.1 (10%) on 2026-05-22 — at
// unsampled volume web_vital was ~35k rows in 60 days (~25% of all
// ui_events). Per-route p75/p95 distributions remain accurate at 10%
// because vitals fire many times per session; sample size per
// (route, metric, day) is still well above the 30-sample floor needed
// for stable percentiles on a site this size.
const WEB_VITAL_SAMPLE_RATE = 0.1;

/**
 * Streams Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to the ui_events
 * table so the admin analytics views can slice perf by route, device,
 * and connection. Sampled at 10% — see WEB_VITAL_SAMPLE_RATE above.
 * Sentry already captures vitals on its own trace sample.
 */
export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (typeof window === "undefined") return;
    if (isNativeApp()) return;
    if (Math.random() >= WEB_VITAL_SAMPLE_RATE) return;

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
        // Recorded so analytics queries can extrapolate true volume:
        // count(*) * (1 / sample_rate).
        sample_rate: WEB_VITAL_SAMPLE_RATE,
      },
    });
  });

  return null;
}
