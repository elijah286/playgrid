/**
 * Regression guard for the offline IndexedDB cache's failure semantics.
 *
 * WKWebView's storage service can refuse `indexedDB.open` in the first
 * moments after a cold app launch (the iOS first-offline-boot race). The
 * wrapper must treat that as transient: cache a successful CONNECTION
 * forever, but never cache a REJECTION — the next read retries from
 * scratch. Before this guard, one bad open pinned every subsequent read of
 * the page session to the same error, so the offline viewer stayed broken
 * until a full reload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeRequest = {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  result: unknown;
  error: Error | null;
};

function makeRequest(): FakeRequest {
  return { onsuccess: null, onerror: null, onupgradeneeded: null, result: undefined, error: null };
}

/** Fire an event on the next macrotask so handlers attach first. */
function fire(fn: () => void) {
  setTimeout(fn, 0);
}

const META_ROW = {
  id: "pb1",
  name: "Test playbook",
  season: null,
  sportVariant: "flag_5v5",
  color: "#123456",
  logoUrl: null,
  ownerLabel: null,
  playCount: 1,
  downloadedAt: "2026-07-01T00:00:00.000Z",
};

/** Minimal IDBDatabase fake: every store `get` resolves with META_ROW. */
function makeFakeDb() {
  return {
    objectStoreNames: { contains: () => true },
    transaction: () => ({
      objectStore: () => ({
        get: () => {
          const req = makeRequest();
          req.result = META_ROW;
          fire(() => req.onsuccess?.());
          return req;
        },
      }),
    }),
  };
}

describe("openDb retry semantics (via getCachedPlaybookMeta)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("a failed open is retried on the next call, then the connection is cached", async () => {
    const openCalls: FakeRequest[] = [];
    let failNextOpen = true;
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req = makeRequest();
        openCalls.push(req);
        if (failNextOpen) {
          req.error = new Error("Connection to background storage aborted");
          fire(() => req.onerror?.());
        } else {
          req.result = makeFakeDb();
          fire(() => req.onsuccess?.());
        }
        return req;
      },
    });

    const db = await import("./db");

    // 1. First-boot race: the open fails and the read rejects.
    await expect(db.getCachedPlaybookMeta("pb1")).rejects.toThrow(
      "Connection to background storage aborted",
    );
    expect(openCalls).toHaveLength(1);

    // 2. Storage service is up now — the SAME session must retry the open,
    //    not replay the cached rejection.
    failNextOpen = false;
    await expect(db.getCachedPlaybookMeta("pb1")).resolves.toEqual(META_ROW);
    expect(openCalls).toHaveLength(2);

    // 3. Success IS cached: further reads reuse the connection.
    await expect(db.getCachedPlaybookMeta("pb1")).resolves.toEqual(META_ROW);
    expect(openCalls).toHaveLength(2);
  });

  it("rejects (not hangs) when IndexedDB is missing entirely", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const db = await import("./db");
    await expect(db.getCachedPlaybookMeta("pb1")).rejects.toThrow(
      "IndexedDB unavailable",
    );
  });
});
