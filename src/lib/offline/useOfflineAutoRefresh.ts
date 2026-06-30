"use client";

import { useEffect, useRef } from "react";
import {
  getPlaybookOfflineBundleAction,
  getPlaybookOfflineSignatureAction,
  listOfflinePlaybookIdsAction,
} from "@/app/actions/offline";
import { listCachedPlaybooks, putPlaybookBundle } from "./db";

/** How often the loop wakes itself up while the tab stays open. */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
/** Throttle: skip a refresh pass if the previous one happened within this window. */
const MIN_GAP_MS = 60 * 1000; // 1 minute
/** Initial delay after mount so we don't fight the first paint. */
const INITIAL_DELAY_MS = 5_000;

/**
 * Background-refresh loop for offline-cached playbooks. Mount once at the
 * dashboard layer; the hook runs on mount, when the device comes back online,
 * when the tab becomes visible again, and on a 30-minute timer.
 *
 * Two modes:
 *   - default (`autoCache=false`): walk every ALREADY-cached playbook and
 *     refresh the stale ones. This is the original behavior — a coach only
 *     has offline copies of playbooks they manually tapped "download" on.
 *   - `autoCache=true` (Phase 2, gated + native-only): seed from the coach's
 *     FULL playbook list (listOfflinePlaybookIdsAction) so EVERY playbook is
 *     downloaded, not just the hand-picked ones. The dashboard layout decides
 *     the gate (beta flag + native shell).
 *
 * Either mode pulls the lightweight signature first and skips the full bundle
 * when it still matches the local copy, so steady state costs one cheap call
 * per playbook. putPlaybookBundle rewrites IndexedDB and fires
 * OFFLINE_CACHE_EVENT so badges / the offline pill update.
 *
 * No-ops when offline, when throttled (MIN_GAP_MS), or — in default mode —
 * when nothing is cached.
 */
export function useOfflineAutoRefresh(autoCache = false): void {
  const lastRunRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let alive = true;

    async function runRefresh(): Promise<void> {
      if (!alive) return;
      if (inFlightRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRunRef.current < MIN_GAP_MS) return;
      lastRunRef.current = now;
      inFlightRef.current = true;
      try {
        const cached = await listCachedPlaybooks();
        const localSig = new Map(cached.map((m) => [m.id, m.signature]));

        // Which playbooks to walk. In autoCache mode, the coach's full set
        // (so never-downloaded playbooks get cached too); otherwise just
        // what's already local. Fall back to the cached set if the server
        // list can't be fetched (offline mid-pass, etc.).
        let ids: string[];
        if (autoCache) {
          const all = await listOfflinePlaybookIdsAction();
          ids = all.ok ? all.ids : cached.map((m) => m.id);
        } else {
          ids = cached.map((m) => m.id);
        }

        for (const id of ids) {
          if (!alive) return;
          if (typeof navigator !== "undefined" && !navigator.onLine) return;
          try {
            const sig = await getPlaybookOfflineSignatureAction(id);
            if (!sig.ok) continue;
            const have = localSig.get(id);
            // Already cached AND unchanged → nothing to do. A missing local
            // entry (new playbook in autoCache mode) has no signature, so it
            // always falls through to the bundle fetch.
            if (have && sig.signature === have) continue;
            const full = await getPlaybookOfflineBundleAction(id);
            if (!full.ok) continue;
            await putPlaybookBundle({
              meta: full.bundle.meta,
              plays: full.bundle.plays,
              documents: full.bundle.documents,
            });
          } catch {
            // Per-playbook failures shouldn't break the rest of the loop —
            // e.g. a playbook the user has lost access to should be skipped,
            // not crash the whole refresh pass.
          }
        }
      } catch {
        // Silent failure: IndexedDB unavailable, etc. The cached copy stays
        // as-is and the next loop tick tries again.
      } finally {
        inFlightRef.current = false;
      }
    }

    const initialTimer = setTimeout(() => {
      void runRefresh();
    }, INITIAL_DELAY_MS);

    const intervalTimer = setInterval(() => {
      void runRefresh();
    }, REFRESH_INTERVAL_MS);

    const onOnline = (): void => {
      void runRefresh();
    };
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void runRefresh();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoCache]);
}
