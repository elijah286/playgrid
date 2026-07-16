"use client";

import { useEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import {
  getConnectivityServerSnapshot,
  getConnectivitySnapshot,
  subscribeConnectivity,
} from "./connectivity";
import { getCachedPlaybookMeta, OFFLINE_CACHE_EVENT } from "./db";

/**
 * The playbook logo that will actually LOAD right now.
 *
 * A team logo lives on a cross-origin CDN, so the service worker can't cache it
 * (isStaticAsset covers same-origin assets only) and offline the remote URL is
 * simply dead — a bare <img src={deadUrl}> renders a broken-image glyph. The
 * download already inlines the logo as a data: URL (`logoDataUrl`) into
 * IndexedDB for exactly this reason.
 *
 * The catch: only the PARALLEL offline components ever read `logoDataUrl`. The
 * real playbook header and the real editor chrome render the remote `logoUrl`,
 * so the moment we made the REAL pages load offline (document nav → SW-cached
 * HTML), the logo broke — reported on a real iPad 2026-07-16. That is the same
 * disease as the wrong-looking play and the un-openable playbook: the real code
 * doesn't know the offline cache exists, so a lookalike was built beside it.
 *
 * This hook is the small, correct version of the cure: the REAL component reads
 * the cache. Online it returns the remote URL unchanged (fresh, CDN-served);
 * offline it swaps in the cached data: URL when we have one, else null so the
 * caller falls back to its initial/monogram — never a broken image.
 */
export function useOfflineLogo(
  playbookId: string | null | undefined,
  logoUrl: string | null,
): string | null {
  const isOnline = useSyncExternalStore(
    subscribeConnectivity,
    getConnectivitySnapshot,
    getConnectivityServerSnapshot,
  );
  const [cached, setCached] = useState<string | null>(null);

  useEffect(() => {
    if (!playbookId) return;
    let alive = true;
    const read = () => {
      void getCachedPlaybookMeta(playbookId)
        .then((m) => {
          if (alive) setCached(m?.logoDataUrl ?? null);
        })
        .catch(() => {
          /* no cache — stays null */
        });
    };
    read();
    // Re-read when the offline copy changes (download / refresh / remove).
    window.addEventListener(OFFLINE_CACHE_EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(OFFLINE_CACHE_EVENT, read);
    };
  }, [playbookId]);

  // Online: the remote URL is correct and always fresher than a snapshot.
  if (isOnline) return logoUrl;
  // Offline: only the inlined copy can render. Null → caller shows the initial,
  // which is honest; a dead remote URL would render a broken image.
  return cached;
}
