import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/offline/db", () => ({
  listCachedPlaybooks: vi.fn(),
}));

import {
  primeOfflineShell,
  registerOfflineServiceWorker,
} from "@/lib/native/registerServiceWorker";
import { listCachedPlaybooks } from "@/lib/offline/db";

/**
 * primeOfflineShell runs when a session becomes available. It must
 * (1) retry SW registration — the mount-time attempt runs pre-login on fresh
 * installs and fails while /sw.js needed auth; (2) precache the shell routes
 * now that they'll render authed content; (3) re-prime /offline/<id> for
 * playbooks already saved to IndexedDB, whose download-time precache no-oped
 * while no SW was registered.
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
  it("re-registers the SW and precaches shell + downloaded playbook routes", async () => {
    vi.mocked(listCachedPlaybooks).mockResolvedValue([
      { id: "pb-1" },
      { id: "pb-2" },
    ] as never);

    await primeOfflineShell();

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(postMessage).toHaveBeenCalledWith({
      type: "PRECACHE_URLS",
      urls: ["/home", "/offline", "/offline/pb-1", "/offline/pb-2"],
    });
  });

  it("still primes the shell routes when IndexedDB is unavailable", async () => {
    vi.mocked(listCachedPlaybooks).mockRejectedValue(new Error("idb cold"));

    await primeOfflineShell();

    expect(postMessage).toHaveBeenCalledWith({
      type: "PRECACHE_URLS",
      urls: ["/home", "/offline"],
    });
  });
});

describe("registerOfflineServiceWorker", () => {
  it("swallows registration failures (offline app still works online)", async () => {
    register.mockRejectedValueOnce(new Error("SecurityError"));
    await expect(registerOfflineServiceWorker()).resolves.toBeUndefined();
  });
});
