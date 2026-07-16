"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkCachedRoutes,
  OFFLINE_ROUTES_EVENT,
} from "@/lib/native/registerServiceWorker";
import {
  getCachedPlaybookMeta,
  getCachedPlayDocuments,
  OFFLINE_CACHE_EVENT,
} from "./db";

/**
 * Which plays are GENUINELY available offline.
 *
 * "Downloaded" is two independent things, and a coach only has a good offline
 * experience when BOTH have landed:
 *   1. the play's document in IndexedDB (arrives atomically with the bundle), and
 *   2. the play's `/plays/<id>/edit` page in the SW cache (streams in one page
 *      per play, 3 at a time, well AFTER the bundle is written).
 *
 * Reporting readiness off (1) alone is what made "Available offline" appear
 * while pages were still downloading — the coach taps a play and it won't open.
 * So readiness here is the INTERSECTION, and it's measured (a real Cache API
 * query via the worker), never assumed.
 *
 * Returns the set of playIds that are fully ready. Empty on web / before the
 * first check — callers should render the glyph only for ids in the set, so an
 * unknown state under-claims rather than over-claims.
 */
export function useOfflinePlayReadiness(
  playbookId: string,
  playIds: string[],
): Set<string> {
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  // Stable key so the effect doesn't re-fire on every render from a new array
  // identity (the play list is rebuilt on each parent render).
  const idsKey = playIds.join(",");

  const check = useCallback(async (): Promise<Set<string>> => {
    if (playIds.length === 0) return new Set();
    const [meta, docs, routes] = await Promise.all([
      // Gates on OFFLINE_FORMAT_VERSION. A copy is trusted or untrusted
      // EVERYWHERE — checking the stamp here but not for the play documents is
      // what produced the incoherent state a coach hit on 2026-07-16: every play
      // wore a green check (documents path, ungated) while the playbook's logo
      // was missing (meta path, gated). Same copy, two verdicts.
      getCachedPlaybookMeta(playbookId).catch(() => null),
      getCachedPlayDocuments(playbookId).catch(() => new Map<string, unknown>()),
      checkCachedRoutes(playIds.map((id) => `/plays/${id}/edit`)).catch(
        () => new Set<string>(),
      ),
    ]);
    // No trusted copy → nothing is ready, whatever else is lying around. The
    // coach re-downloads and gets a coherent one.
    if (!meta) return new Set();
    return new Set(
      playIds.filter((id) => docs.has(id) && routes.has(`/plays/${id}/edit`)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId, idsKey]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      void check().then((s) => {
        if (alive) setReady(s);
      });
    };
    run();

    // Re-check when either half changes: the bundle write (IndexedDB) or a
    // precache tick (routes). Both fire while a download is in flight, so the
    // glyphs light up play-by-play as they actually become openable.
    window.addEventListener(OFFLINE_CACHE_EVENT, run);
    window.addEventListener(OFFLINE_ROUTES_EVENT, run);
    return () => {
      alive = false;
      window.removeEventListener(OFFLINE_CACHE_EVENT, run);
      window.removeEventListener(OFFLINE_ROUTES_EVENT, run);
    };
  }, [check]);

  return ready;
}
