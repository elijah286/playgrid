"use client";

import { useEffect, useRef } from "react";
import {
  getPlaybookOfflineBundleAction,
  getPlaybookOfflineSignatureAction,
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
 * dashboard layer; the hook walks every cached playbook on mount, when the
 * device comes back online, when the tab becomes visible again, and on a
 * 30-minute timer.
 *
 * For each cached playbook it pulls the lightweight signature first; if it
 * matches what we cached, we skip the full bundle fetch. When the signature
 * has changed we pull the full bundle and `putPlaybookBundle` rewrites
 * IndexedDB, which fires `OFFLINE_CACHE_EVENT` and lights up any UI that's
 * watching (badges, the offline pill on PlaybookHeader, etc.).
 *
 * No-ops when:
 *   - nothing is cached (most users on web)
 *   - the device reports offline (we'd just fail every action)
 *   - another refresh ran within `MIN_GAP_MS` (debounces visibility +
 *     online events firing in quick succession)
 */
export function useOfflineAutoRefresh(): void {
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
        for (const meta of cached) {
          if (!alive) return;
          if (typeof navigator !== "undefined" && !navigator.onLine) return;
          try {
            const sig = await getPlaybookOfflineSignatureAction(meta.id);
            if (!sig.ok) continue;
            if (meta.signature && sig.signature === meta.signature) continue;
            const full = await getPlaybookOfflineBundleAction(meta.id);
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
  }, []);
}
