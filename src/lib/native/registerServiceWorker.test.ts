import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/offline/db", () => ({
  listCachedPlaybooks: vi.fn(),
  getCachedPlays: vi.fn(),
}));

import {
  primeOfflineShell,
  registerOfflineServiceWorker,
} from "@/lib/native/registerServiceWorker";
import { listCachedPlaybooks, getCachedPlays } from "@/lib/offline/db";

/**
 * primeOfflineShell runs when a session becomes available. It must
 * (1) retry SW registration; (2) SELF-HEAL the offline cache by precaching the
 * REAL routes for every downloaded playbook — /home, each /playbooks/<id>, and
 * each of its plays' /plays/<id>/edit — with dedupe so old downloads gain the
 * play pages without a manual re-download and repeat launches stay cheap.
 */

const register = vi.fn().mockResolvedValue(undefined);
const postMessage = vi.fn();

beforeEach(() => {
  register.mockClear();
  postMessage.mockClear();
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register,
      getRegistration: vi
        .fn()
        .mockResolvedValue({ active: { postMessage } }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("primeOfflineShell", () => {
  it("re-registers the SW and self-heals the real playbook + play routes (deduped)", async () => {
    vi.mocked(listCachedPlaybooks).mockResolvedValue([
      { id: "pb-1" },
      { id: "pb-2" },
    ] as never);
    vi.mocked(getCachedPlays).mockImplementation(
      async (pbId: string) =>
        (pbId === "pb-1"
          ? [{ id: "p1" }, { id: "p2" }]
          : [{ id: "p3" }]) as never,
    );

    await primeOfflineShell();

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(postMessage).toHaveBeenCalledWith({
      type: "PRECACHE_URLS",
      dedupe: true,
      urls: [
        "/home",
        "/playbooks/pb-1",
        "/plays/p1/edit",
        "/plays/p2/edit",
        "/playbooks/pb-2",
        "/plays/p3/edit",
      ],
    });
  });

  it("still primes /home when IndexedDB is unavailable", async () => {
    vi.mocked(listCachedPlaybooks).mockRejectedValue(new Error("idb cold"));

    await primeOfflineShell();

    expect(postMessage).toHaveBeenCalledWith({
      type: "PRECACHE_URLS",
      dedupe: true,
      urls: ["/home"],
    });
  });

  it("still primes a playbook page when its plays are unreadable", async () => {
    vi.mocked(listCachedPlaybooks).mockResolvedValue([{ id: "pb-1" }] as never);
    vi.mocked(getCachedPlays).mockRejectedValue(new Error("plays cold"));

    await primeOfflineShell();

    expect(postMessage).toHaveBeenCalledWith({
      type: "PRECACHE_URLS",
      dedupe: true,
      urls: ["/home", "/playbooks/pb-1"],
    });
  });
});

describe("registerOfflineServiceWorker", () => {
  it("swallows registration failures (offline app still works online)", async () => {
    register.mockRejectedValueOnce(new Error("SecurityError"));
    await expect(registerOfflineServiceWorker()).resolves.toBeUndefined();
  });
});
