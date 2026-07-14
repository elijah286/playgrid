"use client";

import { useEffect } from "react";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";
import { setAppBadge } from "@/lib/native/appBadge";

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
 */
export function NativeBadgeSync() {
  const { count } = useInboxBadge();

  useEffect(() => {
    void setAppBadge(count);
  }, [count]);

  return null;
}
