"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getConnectivitySnapshot,
  getConnectivityServerSnapshot,
  subscribeConnectivity,
} from "./connectivity";
import {
  checkCachedRoutes,
  OFFLINE_ROUTES_EVENT,
} from "@/lib/native/registerServiceWorker";
import {
  listCachedPlaybooks,
  OFFLINE_CACHE_EVENT,
  type CachedPlaybookMeta,
} from "./db";

export type OfflineState = {
  /** True when the device can reach the server. SSR returns true. */
  isOnline: boolean;
  /**
   * Playbooks that ACTUALLY open without signal — data in IndexedDB AND the
   * page really present in the SW cache (measured, never assumed). The offline
   * badge and all offline navigation gating must use this.
   *
   * Deliberately NOT "whatever is in IndexedDB". "Downloaded" is two independent
   * caches with no shared truth — the data and the page — and only the page is
   * what fails. A coach reported (2026-07-16) that all 30+ playbooks showed the
   * offline cloud though they had downloaded none: the background auto-cache
   * loop (useOfflineAutoRefresh with autoCache) seeds from the coach's FULL
   * library and calls putPlaybookBundle, but never precaches a single page. So
   * IndexedDB claimed the whole library was downloaded while nothing opened —
   * tapping a tile just bounced back to /home on a cache miss.
   *
   * Measuring the page makes that whole class of bug unable to surface: a row
   * written by a data-only writer cannot produce a badge, because no page was
   * ever cached. Empty until the check resolves, so it under-claims rather than
   * over-claims.
   */
  downloadedIds: Set<string>;
  /**
   * Metadata for every playbook whose DATA is cached, newest-first. Broader than
   * `downloadedIds` on purpose — the inlined logo lives here and is worth using
   * even when the page isn't cached. Never use this to decide whether a playbook
   * opens offline; that's `downloadedIds`.
   */
  downloaded: CachedPlaybookMeta[];
  /** True once the initial IndexedDB read has completed — useful to avoid flashing "no downloads" before we've checked. */
  ready: boolean;
};

const EMPTY_SET: Set<string> = new Set();

/**
 * Source of truth for offline UX: are we connected, and which playbooks are
 * already cached for offline use. Connectivity comes from the shared
 * connectivity store (see ./connectivity.ts) — NOT raw `navigator.onLine`,
 * which WKWebView reports as `true` on airplane-mode cold launches. Routing
 * decisions built on the raw flag sent offline coaches to network-only
 * routes that died in "Something went wrong." (2026-07-15). The store
 * verifies the flag with a same-origin probe in the native shell and keeps
 * plain-web behavior unchanged.
 *
 * Safe to use anywhere — on SSR returns `{ isOnline: true, downloadedIds:
 * empty, ready: false }` so server-render is identical regardless of device.
 */
export function useOfflineState(): OfflineState {
  const isOnline = useSyncExternalStore(
    subscribeConnectivity,
    getConnectivitySnapshot,
    getConnectivityServerSnapshot,
  );
  const [downloaded, setDownloaded] = useState<CachedPlaybookMeta[]>([]);
  const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    const refresh = () => {
      void listCachedPlaybooks()
        .then(async (rows) => {
          if (!alive) return;
          setDownloaded(rows);
          setReady(true);
          // Verify against the REAL cache: a playbook counts as available
          // offline only if its page is actually there to be served. One
          // batched query for the whole library.
          const cached = await checkCachedRoutes(
            rows.map((r) => `/playbooks/${r.id}`),
          ).catch(() => new Set<string>());
          if (!alive) return;
          setReadyIds(
            new Set(
              rows.map((r) => r.id).filter((id) => cached.has(`/playbooks/${id}`)),
            ),
          );
        })
        .catch(() => {
          if (alive) setReady(true);
        });
    };
    refresh();

    // Re-check when EITHER half changes: the data (download/refresh/remove) or
    // the pages (a precache tick), so a badge appears the moment it's earned.
    window.addEventListener(OFFLINE_CACHE_EVENT, refresh);
    window.addEventListener(OFFLINE_ROUTES_EVENT, refresh);

    return () => {
      alive = false;
      window.removeEventListener(OFFLINE_CACHE_EVENT, refresh);
      window.removeEventListener(OFFLINE_ROUTES_EVENT, refresh);
    };
  }, []);

  const downloadedIds = useMemo(
    () => (ready ? readyIds : EMPTY_SET),
    [readyIds, ready],
  );

  return { isOnline, downloadedIds, downloaded, ready };
}
