/**
 * Lightweight client-side event tracker.
 *
 * Use for in-app behavior signals (CTA clicks, "Save play", "Share clicked")
 * that the Site admin → Traffic → Engagement tab consumes. Page views are
 * already tracked by `PageViewTracker`; do not double-record them here.
 *
 * Best-effort: failures are swallowed so analytics never breaks UX.
 */

import { recordUiEventAction } from "@/app/actions/ui-events";
import { isNativeApp } from "@/lib/native/isNativeApp";

const SESSION_KEY = "playgrid:session-id";

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

export type TrackInput = {
  event: string;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function track(input: TrackInput): void {
  try {
    if (typeof window === "undefined") return;
    if (isNativeApp()) return;
    const path =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : null;
    void recordUiEventAction({
      sessionId: getSessionId(),
      eventName: input.event,
      path,
      target: input.target ?? null,
      metadata: input.metadata ?? null,
    });
  } catch {
    /* swallow */
  }
}
