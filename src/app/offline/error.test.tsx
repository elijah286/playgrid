/**
 * Regression guard for the offline-viewer error boundary.
 *
 * Context (2026-07-01 iOS offline verification): a first-boot crash while
 * opening /offline/<playbookId> escalated to the GLOBAL error page —
 * full-document replacement, .native-shell lost, "Something went wrong. The
 * team has been notified." — on the one surface where the coach has no
 * network to recover with. This file pins the segment-level boundary that
 * keeps such failures inside the offline shell:
 *
 *   1. src/app/offline/error.tsx exists as a client component (Next wires
 *      any error.tsx into the segment automatically — its existence IS the
 *      boundary; moving/deleting it breaks the import below).
 *   2. Recovery is offline-safe: "Try again" calls reset() (client
 *      re-render, no refetch — unstable_retry would re-fetch and fail with
 *      no signal), and the escape hatch is a hard <a href="/offline">
 *      served by the SW cache.
 *   3. The copy reassures instead of alarming — no "team has been notified".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

// Keep the test on the boundary's own behavior — the real ui/index barrel
// drags in unrelated components.
vi.mock("@/components/ui", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

import OfflineViewerError from "./error";

// React's act() environment flag — required for createRoot + act in vitest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const makeError = () => Object.assign(new Error("boom"), { digest: "test" });

describe("offline viewer error boundary", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("is a client component (error boundaries must be)", () => {
    const source = readFileSync(join(__dirname, "error.tsx"), "utf8");
    expect(source.trimStart().startsWith(`"use client"`)).toBe(true);
  });

  it("degrades inside the offline shell: reassuring copy + offline-safe escape hatch", () => {
    const html = renderToStaticMarkup(
      <OfflineViewerError error={makeError()} reset={() => {}} />,
    );
    // Not the global scare page.
    expect(html).not.toContain("The team has been notified");
    expect(html).toContain("Couldn’t open the offline viewer");
    // Downloads survive the crash — say so.
    expect(html).toContain("still on this device");
    // Hard link back to the SW-precached library, reachable with no signal.
    expect(html).toContain('href="/offline"');
  });

  it("recovers via reset() — a client re-render, not a refetch", async () => {
    const reset = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(container);
        root.render(<OfflineViewerError error={makeError()} reset={reset} />);
      });

      const tryAgain = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Try again"),
      );
      expect(tryAgain).toBeDefined();
      await act(async () => {
        tryAgain!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(reset).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("still reports the error to Sentry (best-effort when offline)", async () => {
    const error = makeError();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = createRoot(container);
        root.render(<OfflineViewerError error={error} reset={() => {}} />);
      });
      expect(captureException).toHaveBeenCalledWith(error);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
