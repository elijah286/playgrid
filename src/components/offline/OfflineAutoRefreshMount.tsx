"use client";

import { useOfflineAutoRefresh } from "@/lib/offline/useOfflineAutoRefresh";

/**
 * Headless mount that wires up `useOfflineAutoRefresh` once at the dashboard
 * layer. Exists only so the RSC layout can include the hook (hooks can't run
 * in server components). Renders nothing.
 *
 * `autoCache` (Phase 2, gated + native-only) makes the loop seed from the
 * coach's full playbook list so every playbook is downloaded, not just the
 * ones tapped "download". The dashboard layout computes the gate.
 */
export function OfflineAutoRefreshMount({
  autoCache = false,
}: {
  autoCache?: boolean;
}): null {
  useOfflineAutoRefresh(autoCache);
  return null;
}
