"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listCachedPlaybooks,
  OFFLINE_CACHE_EVENT,
  type CachedPlaybookMeta,
} from "./db";

export type OfflineState = {
  /** True if `navigator.onLine` reports we have a network connection. SSR returns true. */
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
 * already cached for offline use. Listens for `online` / `offline` events on
 * `window`, plus the custom cache-changed event fired by the IndexedDB
 * mutations (`putPlaybookBundle`, `removeCachedPlaybook`).
 *
 * Safe to use anywhere — on SSR returns `{ isOnline: true, downloadedIds:
 * empty, ready: false }` so server-render is identical regardless of device.
 *
 * On first client paint we read `navigator.onLine` synchronously via a lazy
 * initializer so playbook tiles pick the offline link (`/offline/[id]`,
 * hard nav) the moment they hydrate. Defaulting to `true` and updating in
 * useEffect leaves a one-paint window where a coach who taps a tile during
 * cold boot lands on the online detail route — which then fails noisily
 * because no network is available.
 */
export function useOfflineState(): OfflineState {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [downloaded, setDownloaded] = useState<CachedPlaybookMeta[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);

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

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OFFLINE_CACHE_EVENT, refresh);

    return () => {
      alive = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OFFLINE_CACHE_EVENT, refresh);
    };
  }, []);

  const downloadedIds = useMemo(
    () => (ready ? new Set(downloaded.map((d) => d.id)) : EMPTY_SET),
    [downloaded, ready],
  );

  return { isOnline, downloadedIds, downloaded, ready };
}
