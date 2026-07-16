import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Offline copies made by an older build must not claim to be downloaded.
 *
 * Reported on a real iPad (2026-07-16): every pre-existing playbook still showed
 * "Available offline" in the action menu, while none of its plays had a green
 * check and none would open. Cause: "downloaded" is TWO independent caches with
 * no shared truth. The badge was gated on IndexedDB alone — which only proves
 * the DATA landed — while what actually fails is the SW route cache (the pages).
 * Worse, those copies were made by a downloader that was itself broken (the
 * bundle action 400'd on a phantom column, page precaching stranded RSC, and
 * failures were rounded up to a fake 100%).
 *
 * Rather than probe every route from the home screen, we stamp copies we trust.
 * An unstamped copy reads as ABSENT so the UI says "Make available offline" —
 * the truth — and the coach re-downloads deliberately instead of discovering on
 * a sideline that the badge described data we could no longer render.
 */

const rows: Record<string, unknown>[] = [];
const deleted: string[] = [];

vi.mock("./db", async (importOriginal) => await importOriginal());

// Minimal IndexedDB fake: getAll/get read `rows`, delete records the id.
function fakeIndexedDb() {
  const store = {
    getAll: () => req(rows),
    get: (id: string) => req(rows.find((r) => r.id === id)),
    delete: (id: string) => {
      deleted.push(String(id));
      return req(undefined);
    },
    index: () => ({ getAllKeys: () => req([]) }),
    put: () => req(undefined),
  };
  const req = (result: unknown) => {
    const r: Record<string, unknown> = { result };
    queueMicrotask(() => (r.onsuccess as (() => void) | undefined)?.());
    return r;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({
      objectStore: () => store,
      oncomplete: null,
      onerror: null,
      onabort: null,
    }),
  };
  return {
    open: () => {
      const r: Record<string, unknown> = { result: db };
      queueMicrotask(() => (r.onsuccess as (() => void) | undefined)?.());
      return r;
    },
  };
}

beforeEach(() => {
  rows.length = 0;
  deleted.length = 0;
  vi.resetModules();
  vi.stubGlobal("indexedDB", fakeIndexedDb());
  vi.stubGlobal("window", { dispatchEvent: () => true, addEventListener: () => {} });
});

const base = {
  name: "Test",
  season: null,
  sportVariant: "flag_5v5",
  color: "#123",
  logoUrl: null,
  logoDataUrl: null,
  ownerLabel: null,
  playCount: 3,
  downloadedAt: "2026-07-01T00:00:00.000Z",
};

describe("offline copies from an older download format", () => {
  it("an UNSTAMPED (pre-fix) copy does not count as downloaded", async () => {
    rows.push({ id: "old", ...base }); // no formatVersion — the vestigial case
    const { listCachedPlaybooks } = await import("./db");

    expect(await listCachedPlaybooks()).toEqual([]);
  });

  it("an unstamped copy reads as ABSENT (so the action menu offers a download)", async () => {
    rows.push({ id: "old", ...base });
    const { getCachedPlaybookMeta } = await import("./db");

    // The exact surface the coach saw lying: "Available offline" is shown iff
    // this returns a row.
    expect(await getCachedPlaybookMeta("old")).toBeNull();
  });

  it("a CURRENT copy still counts", async () => {
    const { OFFLINE_FORMAT_VERSION } = await import("./db");
    rows.push({ id: "new", ...base, formatVersion: OFFLINE_FORMAT_VERSION });
    const { listCachedPlaybooks, getCachedPlaybookMeta } = await import("./db");

    expect((await listCachedPlaybooks()).map((r) => r.id)).toEqual(["new"]);
    expect(await getCachedPlaybookMeta("new")).not.toBeNull();
  });

  it("keeps the trustworthy copies when both kinds are present", async () => {
    const { OFFLINE_FORMAT_VERSION } = await import("./db");
    rows.push({ id: "old", ...base });
    rows.push({ id: "new", ...base, formatVersion: OFFLINE_FORMAT_VERSION });
    const { listCachedPlaybooks } = await import("./db");

    expect((await listCachedPlaybooks()).map((r) => r.id)).toEqual(["new"]);
  });

  it("purges the stale copy so it doesn't sit on the device forever", async () => {
    rows.push({ id: "old", ...base });
    const { listCachedPlaybooks } = await import("./db");
    await listCachedPlaybooks();
    await new Promise((r) => setTimeout(r, 0)); // purge is fire-and-forget

    expect(deleted).toContain("old");
  });
});
