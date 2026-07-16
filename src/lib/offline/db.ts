"use client";

/**
 * Tiny IndexedDB wrapper for the offline playbook cache.
 *
 * We deliberately avoid `idb` / Dexie — three stores with simple key/value
 * access doesn't justify a dependency, and shipping less JS to the native
 * shell matters for cold-start time.
 *
 * Stores:
 *   - playbooks(key=playbookId): { id, name, season, sportVariant, color,
 *       logoUrl, accentColor, downloadedAt, playCount, ownerLabel }
 *   - plays(key=playId): { id, playbookId, name, wristbandCode, shorthand,
 *       playType, isArchived, ...rest of PlaybookDetailPlayRow }
 *   - documents(key=playId): { playId, document: PlayDocument }
 *
 * `playbookId` is indexed on plays + documents so we can wipe a single
 * playbook's cache without scanning the whole store.
 */

const DB_NAME = "XO Gridmaker-offline";
/** v2 (2026-07-16): + the `drafts` store (see STORE_DRAFTS). Additive only —
 *  onupgradeneeded creates the new store and touches nothing existing, so an
 *  upgrade can never cost a coach a downloaded playbook. */
const DB_VERSION = 2;

/**
 * Format version of an offline copy.
 *
 * Bumped when a download made by an OLDER build can no longer be trusted to
 * actually work offline. A copy below this version is treated as NOT downloaded
 * — the tile reverts to "Make available offline" and the row is purged on the
 * next read, so a coach re-downloads deliberately.
 *
 * Why this exists: "downloaded" is two independent caches with no shared truth.
 * The badge was gated on IndexedDB alone (it proves the DATA landed), while what
 * actually fails is the SW route cache (the pages). Every pre-2026-07-16 copy
 * therefore claimed "Available offline" while its plays had no green check and
 * could not open — the data was there, the pages were not. Rather than probe
 * every route on the home screen, we stamp the copies we know are sound.
 *
 * v2 (2026-07-16) — first version where the download is trustworthy:
 *   - the bundle action works at all (pre-fix it 400'd on a phantom column, so
 *     nothing could be downloaded),
 *   - play pages are precached and verified (the green check is measured),
 *   - failures are reported instead of rounded up to a fake 100%.
 */
export const OFFLINE_FORMAT_VERSION = 2;
const STORE_PLAYBOOKS = "playbooks";
const STORE_PLAYS = "plays";
const STORE_DOCUMENTS = "documents";
/**
 * A coach's UNSAVED work — the only store that holds something the server does
 * not. Everything else here is a copy of server truth and is disposable; a
 * draft is not. Treat it accordingly: never clear one on anything less than a
 * CONFIRMED server write.
 *
 * Why it exists: the editor became fully editable offline (2026-07-16) while
 * every save stayed a server action with no catch. Offline that action REJECTS
 * ("Load failed") rather than returning ok:false, so nothing surfaced and the
 * doc — which lived only in React state — died at unmount, or with the WebView
 * when iOS reclaimed it. Three plays edited at halftime → likely zero survived
 * the drive home, with no warning. Rule: a change is durable on-device the
 * moment it's made, independent of any network call.
 */
const STORE_DRAFTS = "drafts";

/**
 * Fired when the offline cache changes (download/refresh/remove). Listeners
 * like `useOfflineState` reread IndexedDB so badges, gates, and the offline
 * pill update without a reload. Dispatched on `window` so it's cheap and
 * doesn't require a context.
 */
export const OFFLINE_CACHE_EVENT = "xog:offline-cache-changed";

function notifyCacheChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_CACHE_EVENT));
  } catch {
    /* no-op — old browsers without CustomEvent ctor */
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PLAYBOOKS)) {
        db.createObjectStore(STORE_PLAYBOOKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PLAYS)) {
        const s = db.createObjectStore(STORE_PLAYS, { keyPath: "id" });
        s.createIndex("playbookId", "playbookId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        const s = db.createObjectStore(STORE_DOCUMENTS, { keyPath: "playId" });
        s.createIndex("playbookId", "playbookId", { unique: false });
      }
      // v2 — a coach's UNSAVED work. Created additively; existing stores are
      // untouched, so upgrading can never cost someone a downloaded playbook.
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "playId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Cache the CONNECTION, never a failure. WKWebView's storage service can
  // refuse the open in the first moments after a cold app launch; caching
  // that rejection would pin every read for the rest of the page session to
  // the same error (the "offline copy won't open until I force-reload" bug).
  // Dropping the cache on failure makes the next call retry from scratch —
  // which is also what lets the offline error boundary's "Try again" work.
  dbPromise = opening.catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function tx(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type CachedPlaybookMeta = {
  id: string;
  name: string;
  season: string | null;
  sportVariant: string;
  color: string;
  logoUrl: string | null;
  /** The logo image inlined as a data: URL, captured at download time. The
   *  logo lives on a cross-origin CDN the SW won't cache, so offline the
   *  remote `logoUrl` is unreachable — render this instead when present. */
  logoDataUrl: string | null;
  ownerLabel: string | null;
  playCount: number;
  downloadedAt: string;
  /** Bundle fingerprint at download time. Optional for back-compat with
   *  rows cached before the signature field was added — the background
   *  refresh treats missing-signature rows as "always stale" so the very
   *  first auto-refresh upgrades them. */
  signature?: string;
  /** Which download format produced this copy (see OFFLINE_FORMAT_VERSION).
   *  Absent on every pre-2026-07-16 copy — those are not trustworthy and are
   *  treated as not-downloaded. */
  formatVersion?: number;
};

export type CachedPlayRow = {
  id: string;
  playbookId: string;
  name: string;
  wristbandCode: string | null;
  shorthand: string | null;
  playType: string;
  formationName: string | null;
  tags: string[] | null;
  isArchived: boolean;
};

export type CachedPlayDocument = {
  playId: string;
  playbookId: string;
  document: unknown; // serialized PlayDocument
};

export async function putPlaybookBundle(input: {
  meta: CachedPlaybookMeta;
  plays: CachedPlayRow[];
  documents: CachedPlayDocument[];
}): Promise<void> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYBOOKS, STORE_PLAYS, STORE_DOCUMENTS], "readwrite");

  // Wipe any previous rows for this playbook so a refresh removes deleted plays.
  await Promise.all(
    [STORE_PLAYS, STORE_DOCUMENTS].map(async (storeName) => {
      const store = t.objectStore(storeName);
      const idx = store.index("playbookId");
      const keys = await promisify(idx.getAllKeys(IDBKeyRange.only(input.meta.id)));
      await Promise.all(keys.map((k) => promisify(store.delete(k as IDBValidKey))));
    }),
  );

  // Stamp the format so a future build can tell a trustworthy copy from one
  // made by an older, broken downloader. Set here (not server-side) because it
  // describes the CLIENT's download pipeline, not the payload.
  await promisify(
    t
      .objectStore(STORE_PLAYBOOKS)
      .put({ ...input.meta, formatVersion: OFFLINE_FORMAT_VERSION }),
  );
  for (const p of input.plays) {
    await promisify(t.objectStore(STORE_PLAYS).put(p));
  }
  for (const d of input.documents) {
    await promisify(t.objectStore(STORE_DOCUMENTS).put(d));
  }

  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  notifyCacheChanged();
}

/**
 * One trustworthy offline copy, or null. A copy from an older download format
 * reads as ABSENT — this is what the action menu keys off, so an untrustworthy
 * copy must say "Make available offline", not "Available offline" (reported on
 * a real iPad 2026-07-16: every pre-fix playbook claimed to be downloaded while
 * none of its plays had a green check or could open).
 */
export async function getCachedPlaybookMeta(
  playbookId: string,
): Promise<CachedPlaybookMeta | null> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYBOOKS], "readonly");
  const row = await promisify<CachedPlaybookMeta | undefined>(
    t.objectStore(STORE_PLAYBOOKS).get(playbookId),
  );
  if (!row) return null;
  if ((row.formatVersion ?? 0) < OFFLINE_FORMAT_VERSION) {
    void removeCachedPlaybook(row.id).catch(() => {});
    return null;
  }
  return row;
}

/**
 * Every offline copy this build can TRUST. Copies from an older download format
 * are excluded and purged in the background.
 *
 * This is the load-bearing honesty gate for the whole offline UI: the home
 * tile's "Available offline" badge is derived from this list, so a copy that
 * can't actually open must not appear here. A stale copy silently reverts to
 * "Make available offline" — which is simply the truth, and lets a coach
 * re-download deliberately rather than discover on a sideline that the badge
 * was describing data we could no longer render.
 */
export async function listCachedPlaybooks(): Promise<CachedPlaybookMeta[]> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYBOOKS], "readonly");
  const rows = await promisify<CachedPlaybookMeta[]>(
    t.objectStore(STORE_PLAYBOOKS).getAll(),
  );
  const fresh = rows.filter(
    (r) => (r.formatVersion ?? 0) >= OFFLINE_FORMAT_VERSION,
  );
  const stale = rows.filter((r) => (r.formatVersion ?? 0) < OFFLINE_FORMAT_VERSION);
  // Reclaim the space, but never let cleanup failure block the read.
  if (stale.length > 0) {
    void Promise.all(stale.map((r) => removeCachedPlaybook(r.id))).catch(() => {});
  }
  return fresh.sort((a, b) => (a.downloadedAt < b.downloadedAt ? 1 : -1));
}

export async function getCachedPlays(playbookId: string): Promise<CachedPlayRow[]> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYS], "readonly");
  const rows = await promisify<CachedPlayRow[]>(
    t.objectStore(STORE_PLAYS).index("playbookId").getAll(IDBKeyRange.only(playbookId)),
  );
  return rows;
}

/** A single cached play row by id (the plays store is keyed by id). Used by
 *  the editor's offline read-only fallback to show the play's name. */
export async function getCachedPlay(playId: string): Promise<CachedPlayRow | null> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYS], "readonly");
  const row = await promisify<CachedPlayRow | undefined>(
    t.objectStore(STORE_PLAYS).get(playId),
  );
  return row ?? null;
}

export async function getCachedPlayDocument(playId: string): Promise<unknown | null> {
  const db = await openDb();
  const t = tx(db, [STORE_DOCUMENTS], "readonly");
  const row = await promisify<CachedPlayDocument | undefined>(
    t.objectStore(STORE_DOCUMENTS).get(playId),
  );
  return row?.document ?? null;
}

/**
 * All cached play documents for a playbook, keyed by playId. The offline
 * playbook view renders a thumbnail grid (one mini-diagram per play), so it
 * needs every play's document up front rather than lazily one at a time.
 */
export async function getCachedPlayDocuments(
  playbookId: string,
): Promise<Map<string, unknown>> {
  const db = await openDb();
  const t = tx(db, [STORE_DOCUMENTS], "readonly");
  const rows = await promisify<CachedPlayDocument[]>(
    t
      .objectStore(STORE_DOCUMENTS)
      .index("playbookId")
      .getAll(IDBKeyRange.only(playbookId)),
  );
  return new Map(rows.map((r) => [r.playId, r.document]));
}

/**
 * An edit a coach has made that the SERVER HAS NOT CONFIRMED yet.
 *
 * `baseVersionId` is the play_versions id the coach started editing from. It's
 * recorded at draft time because it is the only moment we know it — and it's
 * what lets a later upload tell the four states apart honestly:
 *   mine == base   → they changed nothing → take theirs, no prompt
 *   theirs == base → nobody else moved    → just upload, no prompt
 *   both moved     → a GENUINE conflict   → ask
 * Without it we'd have to guess, and guessing means false-positive conflict
 * prompts for coaches who merely opened a play — worse than the bug.
 */
export type PlayDraft = {
  playId: string;
  playbookId: string;
  /** Serialized PlayDocument — the coach's actual work. */
  document: unknown;
  /** play_versions id this edit started from; null if it wasn't known. */
  baseVersionId: string | null;
  /** ISO — when the coach last touched it. */
  updatedAt: string;
};

/**
 * Record (or overwrite) the pending edit for a play. Called on every change
 * while dirty, so it must stay cheap: one keyed put, no scans.
 */
export async function putPlayDraft(draft: PlayDraft): Promise<void> {
  const db = await openDb();
  const t = tx(db, [STORE_DRAFTS], "readwrite");
  await promisify(t.objectStore(STORE_DRAFTS).put(draft));
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  notifyCacheChanged();
}

export async function getPlayDraft(playId: string): Promise<PlayDraft | null> {
  const db = await openDb();
  const t = tx(db, [STORE_DRAFTS], "readonly");
  const row = await promisify<PlayDraft | undefined>(
    t.objectStore(STORE_DRAFTS).get(playId),
  );
  return row ?? null;
}

/** Every pending edit on this device, oldest first (upload in the order made). */
export async function listPlayDrafts(): Promise<PlayDraft[]> {
  const db = await openDb();
  const t = tx(db, [STORE_DRAFTS], "readonly");
  const rows = await promisify<PlayDraft[]>(t.objectStore(STORE_DRAFTS).getAll());
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
}

/**
 * Drop a draft. ONLY on a CONFIRMED server write (or an explicit discard by the
 * coach) — never optimistically, never on a timeout, never because a save
 * "probably" landed. This row is the only copy of that work.
 */
export async function removePlayDraft(playId: string): Promise<void> {
  const db = await openDb();
  const t = tx(db, [STORE_DRAFTS], "readwrite");
  await promisify(t.objectStore(STORE_DRAFTS).delete(playId));
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  notifyCacheChanged();
}

export async function removeCachedPlaybook(playbookId: string): Promise<void> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYBOOKS, STORE_PLAYS, STORE_DOCUMENTS], "readwrite");
  await promisify(t.objectStore(STORE_PLAYBOOKS).delete(playbookId));
  for (const storeName of [STORE_PLAYS, STORE_DOCUMENTS] as const) {
    const store = t.objectStore(storeName);
    const idx = store.index("playbookId");
    const keys = await promisify(idx.getAllKeys(IDBKeyRange.only(playbookId)));
    await Promise.all(keys.map((k) => promisify(store.delete(k as IDBValidKey))));
  }
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  notifyCacheChanged();
}
