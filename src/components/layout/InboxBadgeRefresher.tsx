"use client";

import { useEffect } from "react";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";
import { getInboxBadgeStateAction } from "@/app/actions/inbox";

/**
 * Headless component that keeps the global inbox badge fresh
 * mid-session without forcing a full router.refresh(). Polls
 * `getInboxBadgeStateAction` every 60s while the tab is visible and
 * once on each visibility-gain. The response is tiny (two numbers)
 * so the poll is cheap.
 *
 * Sits inside `InboxBadgeProvider` so it can push results into the
 * provider via `updateBaseline`. Mount once at the layout level —
 * mounting multiple instances duplicates the poll and that's wasteful
 * (functionally safe; just extra DB queries).
 *
 * Tradeoff vs Supabase realtime: we accept up-to-60s latency for the
 * badge to catch up after an event is created elsewhere (a co-coach
 * accepts a member in a different tab, an opponent sends a message).
 * Realtime would close that gap but adds reconnection / cleanup
 * surface area that isn't worth it for an awareness-grade indicator.
 */
const POLL_INTERVAL_MS = 60_000;

export function InboxBadgeRefresher() {
  const { updateBaseline } = useInboxBadge();

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await getInboxBadgeStateAction();
        if (cancelled) return;
        if (res.ok) updateBaseline(res.count, res.urgent);
      } catch {
        // Network blip — the next tick or visibility-gain will retry.
      }
    }

    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [updateBaseline]);

  return null;
}
