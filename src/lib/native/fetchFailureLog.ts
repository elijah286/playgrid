"use client";

/**
 * Records which fetches FAILED, so a crash can name its own cause.
 *
 * Why this exists: offline, opening a downloaded play paints the real editor for
 * ~100ms and then throws "Load failed" into the error boundary (reported on a
 * real iPad, 2026-07-16). "Load failed" is WebKit's message for a rejected
 * fetch — and WebKit gives those rejections NO useful stack, so the error can
 * never say which request died. Printing it harder doesn't help; the failure has
 * to be recorded where it happens.
 *
 * This is not a guess-narrowing device — every static theory has already been
 * eliminated (no lazy imports in the editor tree, no render-phase throws, and a
 * rejected server action provably can't reach an error boundary). The failing
 * URL is the one fact nobody has, and one reproduction yields it.
 *
 * Deliberately inert:
 *  - native shell only (the SW/offline surface; web keeps a pristine fetch),
 *  - records and RE-THROWS — never swallows, never retries, never alters a
 *    response, so behavior is identical with it installed,
 *  - a tiny ring buffer in memory; nothing is sent anywhere.
 */

export type FetchFailure = {
  url: string;
  method: string;
  /** ms since page load — lets us see how the failure sits relative to paint. */
  at: number;
  message: string;
};

const MAX = 8;
const failures: FetchFailure[] = [];
let installed = false;

function describe(input: unknown, init?: RequestInit): { url: string; method: string } {
  try {
    if (typeof input === "string") {
      return { url: input, method: init?.method ?? "GET" };
    }
    if (input instanceof URL) {
      return { url: input.toString(), method: init?.method ?? "GET" };
    }
    const req = input as Request;
    return { url: req?.url ?? "<unknown>", method: req?.method ?? init?.method ?? "GET" };
  } catch {
    return { url: "<unreadable>", method: "?" };
  }
}

/** Wrap fetch to record rejections. Idempotent; native-only. */
export function installFetchFailureLog(): void {
  if (installed || typeof window === "undefined" || typeof fetch === "undefined") {
    return;
  }
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await original(input as RequestInfo, init);
    } catch (err) {
      const { url, method } = describe(input, init);
      failures.push({
        url,
        method,
        at: Math.round(performance.now()),
        message: err instanceof Error ? err.message : String(err),
      });
      if (failures.length > MAX) failures.shift();
      throw err; // never change behavior — only observe
    }
  };
}

/** Most recent failed fetches, newest last. Empty when nothing has failed. */
export function recentFetchFailures(): FetchFailure[] {
  return failures.slice();
}

/** Test-only. */
export function __resetFetchFailureLogForTests(): void {
  failures.length = 0;
  installed = false;
}
