// @vitest-environment jsdom
/**
 * The fetch-failure recorder sits in the hot path of EVERY request in the native
 * shell, so the load-bearing property is that it changes NOTHING: successes pass
 * through untouched, failures re-throw the original error. It only observes.
 *
 * Why it exists: offline, opening a downloaded play paints the real editor for
 * ~100ms then throws "Load failed" — WebKit's rejected-fetch message, which
 * carries no usable stack. The error therefore cannot name its own cause, and
 * every static theory has already been eliminated (no lazy imports in the editor
 * tree, no render-phase throws, and a rejected server action can't reach an
 * error boundary). The failing URL is the missing fact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetFetchFailureLogForTests,
  installFetchFailureLog,
  recentFetchFailures,
} from "./fetchFailureLog";

const realFetch = vi.fn();

beforeEach(() => {
  __resetFetchFailureLogForTests();
  realFetch.mockReset();
  vi.stubGlobal("fetch", realFetch);
  (window as unknown as { fetch: unknown }).fetch = realFetch;
  vi.stubGlobal("performance", { now: () => 1234 });
});

afterEach(() => {
  __resetFetchFailureLogForTests();
  vi.unstubAllGlobals();
});

describe("installFetchFailureLog", () => {
  it("passes a SUCCESSFUL fetch straight through, untouched", async () => {
    const res = { ok: true, status: 200 };
    realFetch.mockResolvedValue(res);
    installFetchFailureLog();

    await expect(window.fetch("/api/health")).resolves.toBe(res);
    // A success is not a failure — nothing recorded.
    expect(recentFetchFailures()).toEqual([]);
  });

  it("re-throws the ORIGINAL error (never swallows) and records the URL", async () => {
    const boom = new TypeError("Load failed");
    realFetch.mockRejectedValue(boom);
    installFetchFailureLog();

    // Identity matters: callers must see their own error, not a wrapper.
    await expect(window.fetch("/plays/p1/edit?_rsc=abc")).rejects.toBe(boom);
    expect(recentFetchFailures()).toEqual([
      {
        url: "/plays/p1/edit?_rsc=abc",
        method: "GET",
        at: 1234,
        message: "Load failed",
      },
    ]);
  });

  it("records the method and URL of a Request object (server actions POST one)", async () => {
    realFetch.mockRejectedValue(new TypeError("Load failed"));
    installFetchFailureLog();
    const req = { url: "https://x.test/plays/p1/edit", method: "POST" } as Request;

    await expect(window.fetch(req)).rejects.toThrow("Load failed");
    expect(recentFetchFailures()[0]).toMatchObject({
      url: "https://x.test/plays/p1/edit",
      method: "POST",
    });
  });

  it("does NOT double-wrap when installed twice", async () => {
    realFetch.mockRejectedValue(new TypeError("Load failed"));
    installFetchFailureLog();
    installFetchFailureLog();

    await expect(window.fetch("/a")).rejects.toThrow();
    // One entry, not two — a double wrap would record the same failure twice
    // and (worse) nest the hot path.
    expect(recentFetchFailures()).toHaveLength(1);
  });

  it("keeps only the most recent failures (bounded memory)", async () => {
    realFetch.mockRejectedValue(new TypeError("Load failed"));
    installFetchFailureLog();
    for (let i = 0; i < 12; i++) {
      await window.fetch(`/req-${i}`).catch(() => {});
    }
    const got = recentFetchFailures();
    expect(got.length).toBeLessThanOrEqual(8);
    // Newest retained — the failure nearest the crash is the interesting one.
    expect(got.at(-1)!.url).toBe("/req-11");
  });
});
