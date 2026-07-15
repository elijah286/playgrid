"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getConnectivitySnapshot,
  getConnectivityServerSnapshot,
  subscribeConnectivity,
} from "./connectivity";
import {
  listCachedPlaybooks,
  OFFLINE_CACHE_EVENT,
  type CachedPlaybookMeta,
} from "./db";

export type OfflineState = {
  /** True when the device can reach the server. SSR returns true. */
  isOnline: boolean;
  /** IDs of playbooks currently stored in IndexedDB. Empty on SSR / before hydration. */
  downloadedIds: Set<string>;
  /** Metadata for each cached playbook, sorted newest-first by downloadedAt. */
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    const refresh = () => {
      void listCachedPlaybooks()
        .then((rows) => {
          if (alive) {
            setDownloaded(rows);
            setReady(true);
          }
        })
        .catch(() => {
          if (alive) setReady(true);
        });
    };
    refresh();

    window.addEventListener(OFFLINE_CACHE_EVENT, refresh);

    return () => {
      alive = false;
      window.removeEventListener(OFFLINE_CACHE_EVENT, refresh);
    };
  }, []);

  const downloadedIds = useMemo(
    () => (ready ? new Set(downloaded.map((d) => d.id)) : EMPTY_SET),
    [downloaded, ready],
  );

  return { isOnline, downloadedIds, downloaded, ready };
}
