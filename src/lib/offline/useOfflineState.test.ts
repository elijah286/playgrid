// @vitest-environment jsdom
/**
 * "Available offline" must mean the playbook OPENS offline.
 *
 * Reported on a real iPad (2026-07-16): "all 30+ playbooks have a green cloud on
 * them. I have not downloaded all of these playbooks." Cause: `downloadedIds`
 * was derived from IndexedDB alone, and the background auto-cache loop
 * (useOfflineAutoRefresh with autoCache, gated on the offline_auto_cache beta
 * flag which was "me" = site admins) seeds from the coach's ENTIRE library and
 * calls putPlaybookBundle — while never calling precacheUrls. So it wrote DATA
 * for every playbook and cached ZERO pages: the whole library claimed to be
 * downloaded, and tapping any of it bounced back to /home on a cache miss.
 *
 * "Downloaded" is two independent caches with no shared truth. Only the page
 * cache decides whether anything opens, so that is what the badge must measure.
 * These tests pin that a data-only writer — this loop, or any future one —
 * cannot produce a badge for a playbook that won't open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";

let cachedRoutes: string[] = [];
const checkCachedRoutes = vi.fn(async (urls: string[]) =>
  new Set(urls.filter((u) => cachedRoutes.includes(u))),
);
vi.mock("@/lib/native/registerServiceWorker", () => ({
  OFFLINE_ROUTES_EVENT: "xog:offline-routes-changed",
  checkCachedRoutes: (urls: string[]) => checkCachedRoutes(urls),
}));

let rows: { id: string }[] = [];
vi.mock("./db", () => ({
  OFFLINE_CACHE_EVENT: "xog:offline-cache-changed",
  listCachedPlaybooks: vi.fn(async () => rows),
}));

vi.mock("./connectivity", () => ({
  subscribeConnectivity: () => () => {},
  getConnectivitySnapshot: () => true,
  getConnectivityServerSnapshot: () => true,
}));

import { useOfflineState, type OfflineState } from "./useOfflineState";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let seen: OfflineState | null = null;

function Probe() {
  seen = useOfflineState();
  return null;
}

async function mount() {
  await act(async () => {
    root.render(createElement(Probe));
  });
  // let listCachedPlaybooks + checkCachedRoutes settle
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  cachedRoutes = [];
  seen = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("downloadedIds is measured, not assumed", () => {
  it("a data-only row (auto-cache loop) produces NO badge", async () => {
    // Exactly the reported state: the loop wrote data for the whole library...
    rows = [{ id: "pb-1" }, { id: "pb-2" }, { id: "pb-3" }];
    cachedRoutes = []; // ...and cached zero pages.

    await mount();

    // The bug: all three used to claim "Available offline" and open nothing.
    expect([...seen!.downloadedIds]).toEqual([]);
    // The data IS still exposed — the inlined logo is worth having.
    expect(seen!.downloaded).toHaveLength(3);
  });

  it("only playbooks whose PAGE is really cached count as downloaded", async () => {
    rows = [{ id: "pb-1" }, { id: "pb-2" }];
    cachedRoutes = ["/playbooks/pb-2"]; // only pb-2 was truly downloaded

    await mount();

    expect([...seen!.downloadedIds]).toEqual(["pb-2"]);
  });

  it("under-claims while the check is still in flight (never a premature badge)", async () => {
    rows = [{ id: "pb-1" }];
    // Hold the SW's answer so we can observe the pre-answer state — the window
    // in which the old code would already be showing a cloud.
    let answer: (v: Set<string>) => void = () => {};
    checkCachedRoutes.mockReturnValueOnce(
      new Promise<Set<string>>((r) => (answer = r)),
    );

    await mount();
    // Data is known, page unverified → NO badge yet. Silence beats a guess.
    expect([...seen!.downloadedIds]).toEqual([]);
    expect(seen!.downloaded).toHaveLength(1);

    await act(async () => {
      answer(new Set(["/playbooks/pb-1"]));
      await Promise.resolve();
    });
    // Verified → the badge is earned.
    expect([...seen!.downloadedIds]).toEqual(["pb-1"]);
  });

  it("no service worker (web) → nothing claims to be offline-ready", async () => {
    rows = [{ id: "pb-1" }];
    checkCachedRoutes.mockResolvedValueOnce(new Set<string>()); // no worker
    await mount();
    expect([...seen!.downloadedIds]).toEqual([]);
  });

  it("a failing cache query never invents a badge", async () => {
    rows = [{ id: "pb-1" }];
    checkCachedRoutes.mockRejectedValueOnce(new Error("worker gone"));
    await mount();
    expect([...seen!.downloadedIds]).toEqual([]);
  });
});
