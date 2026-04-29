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
const DB_VERSION = 1;
const STORE_PLAYBOOKS = "playbooks";
const STORE_PLAYS = "plays";
const STORE_DOCUMENTS = "documents";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
  ownerLabel: string | null;
  playCount: number;
  downloadedAt: string;
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

  await promisify(t.objectStore(STORE_PLAYBOOKS).put(input.meta));
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
}

export async function getCachedPlaybookMeta(
  playbookId: string,
): Promise<CachedPlaybookMeta | null> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYBOOKS], "readonly");
  const row = await promisify<CachedPlaybookMeta | undefined>(
    t.objectStore(STORE_PLAYBOOKS).get(playbookId),
  );
  return row ?? null;
}

export async function listCachedPlaybooks(): Promise<CachedPlaybookMeta[]> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYBOOKS], "readonly");
  const rows = await promisify<CachedPlaybookMeta[]>(
    t.objectStore(STORE_PLAYBOOKS).getAll(),
  );
  return rows.sort((a, b) => (a.downloadedAt < b.downloadedAt ? 1 : -1));
}

export async function getCachedPlays(playbookId: string): Promise<CachedPlayRow[]> {
  const db = await openDb();
  const t = tx(db, [STORE_PLAYS], "readonly");
  const rows = await promisify<CachedPlayRow[]>(
    t.objectStore(STORE_PLAYS).index("playbookId").getAll(IDBKeyRange.only(playbookId)),
  );
  return rows;
}

export async function getCachedPlayDocument(playId: string): Promise<unknown | null> {
  const db = await openDb();
  const t = tx(db, [STORE_DOCUMENTS], "readonly");
  const row = await promisify<CachedPlayDocument | undefined>(
    t.objectStore(STORE_DOCUMENTS).get(playId),
  );
  return row?.document ?? null;
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
}
