"use client";

import { useOfflineAutoRefresh } from "@/lib/offline/useOfflineAutoRefresh";

/**
 * Headless mount that wires up `useOfflineAutoRefresh` once at the dashboard
 * layer. Exists only so the RSC layout can include the hook (hooks can't run
 * in server components). Renders nothing.
 */
export function OfflineAutoRefreshMount(): null {
  useOfflineAutoRefresh();
  return null;
}
