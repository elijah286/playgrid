"use client";

import { useEffect, useRef } from "react";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";
import { setAppBadge } from "@/lib/native/appBadge";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { reconcileAppBadgeAction } from "@/app/actions/app-badge";

/**
 * Headless: keeps the native app-icon badge in lockstep with the in-app inbox
 * count while the app is open. Mount once inside `InboxBadgeProvider`.
 *
 * The provider's count already stays live — `InboxBadgeRefresher` re-polls on
 * a 60s tick and on every visibility-gain, and a native resume fires the same
 * `visibilitychange`. So whenever the coach foregrounds the app, the count
 * refreshes and this effect pushes it to the icon: opening the app after
 * reading the inbox on the web drops the badge to its true value (or clears it),
 * without waiting for the next push. No-ops on web (setAppBadge self-gates).
 *
 * Older builds (iOS <= 1.0.1) predate the badge plugin, so `setAppBadge` can't
 * write the icon and returns false. There the badge is a one-way ratchet —
 * pushes raise it, nothing lowers it — and a coach is left with a "1" over an
 * empty inbox. For those builds only, fall back to a server-side reconcile that
 * clears the icon the same way it was set: a badge-only push. Drops out once
 * everyone is on a build that can badge itself.
 */
export function NativeBadgeSync() {
  const { count } = useInboxBadge();
  // Last count we asked the server to reconcile, so a re-render or the 60s poll
  // can't re-request the same one. The server is idempotent regardless
  // (device_tokens.last_badge), this just avoids the round-trip.
  const reconciledFor = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const applied = await setAppBadge(count);
      if (cancelled || applied || !isNativeApp()) return;
      if (reconciledFor.current === count) return;
      reconciledFor.current = count;
      try {
        await reconcileAppBadgeAction();
      } catch {
        // Best-effort: a failed reconcile retries on the next count change.
        if (!cancelled) reconciledFor.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [count]);

  return null;
}
