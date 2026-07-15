import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  primeOfflineShell,
  registerOfflineServiceWorker,
} from "@/lib/native/registerServiceWorker";

/**
 * primeOfflineShell runs when a session becomes available. It (1) retries SW
 * registration and (2) primes ONLY /home. It must NEVER fan out over the
 * coach's whole library — a dozens-of-playbooks sweep on every launch floods
 * the connection and makes the online app feel offline (regression 2026-07-15).
 * Real playbook/play pages cache on visit + via explicit throttled download.
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
  it("re-registers the SW and primes ONLY /home (no library-wide sweep)", async () => {
    await primeOfflineShell();

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(postMessage).toHaveBeenCalledWith({
      type: "PRECACHE_URLS",
      dedupe: false,
      urls: ["/home"],
    });
    // Exactly one precache message — never a per-playbook / per-play fan-out.
    expect(postMessage).toHaveBeenCalledTimes(1);
    const urls = postMessage.mock.calls[0][0].urls as string[];
    expect(urls.some((u) => u.startsWith("/playbooks/"))).toBe(false);
    expect(urls.some((u) => u.startsWith("/plays/"))).toBe(false);
  });
});

describe("registerOfflineServiceWorker", () => {
  it("swallows registration failures (offline app still works online)", async () => {
    register.mockRejectedValueOnce(new Error("SecurityError"));
    await expect(registerOfflineServiceWorker()).resolves.toBeUndefined();
  });
});
