// @vitest-environment jsdom
/**
 * Editor error boundary — the "no degraded fallback" rule, made executable.
 *
 * Founder rule (2026-07-16): "There should be no degraded fallback option.
 * Either we have the tools and the data we need to view the play correctly
 * offline or we report that the play is not available offline."
 *
 * History this guards: the boundary used to draw the play with PlayDocRender
 * (the Coach Cal chat-embed renderer) as a read-only "offline view". A second
 * SVG engine impersonating the first, it diverged silently — horizontal instead
 * of rotated yard numbers, the free-form 50-yard fallback instead of the real
 * field position, and no defense overlay at all. The same coach reported "the
 * plays look totally different" TWICE in 24 hours, because a lookalike is
 * convincing enough to hide its own wrongness. The real editor renders offline
 * correctly once reached by a document nav (verified on a real iPad 2026-07-16),
 * so reaching this boundary offline now means the play truly isn't on the device.
 *
 * The load-bearing assertion is the negative one: this boundary MUST NOT draw a
 * play. If someone reintroduces an "offline viewer" here, that test fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let native = true;
vi.mock("@/lib/native/isNativeApp", () => ({
  isNativeApp: () => native,
}));

let online = false;
vi.mock("@/lib/offline/connectivity", () => ({
  probeConnectivity: () => Promise.resolve(online),
}));

import EditorError from "./error";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(<EditorError error={new Error("Load failed")} reset={() => {}} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  native = true;
  online = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.history.pushState({}, "", "/plays/play-1/edit");
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("editor error boundary — offline", () => {
  it("reports the play is NOT AVAILABLE offline (no approximation)", async () => {
    await mount();
    expect(container.textContent).toContain("isn’t available offline");
  });

  it("NEVER draws a play — no degraded lookalike renderer", async () => {
    await mount();
    // "Full field width" is PlayDocRender's chat-embed toolbar — the exact
    // string from the coach's offline screenshot that identified which renderer
    // they were seeing. Its absence means we are not drawing a play.
    expect(container.textContent).not.toContain("Full field width");
    expect(container.textContent).not.toContain("Speed");
  });

  it("STATIC GUARD: the boundary imports no play renderer at all", () => {
    // The durable enforcement of the rule. Asserting on rendered markup is weak
    // (icons are <svg> too); asserting on the IMPORT is precise: this boundary
    // must never be able to draw a play. If someone reintroduces an "offline
    // viewer" here — as happened on 2026-07-15, swapping a bespoke renderer for
    // PlayDocRender and shipping the same bug again — this fails immediately.
    const src = readFileSync(join(__dirname, "error.tsx"), "utf8");
    const imports = src
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l))
      .join("\n");
    expect(imports).not.toContain("PlayDiagramEmbed");
    expect(imports).not.toContain("PlayDocRender");
    expect(imports).not.toContain("EditorCanvas");
    expect(imports).not.toContain("DiagramCanvas");
  });

  it("points the coach at the real remedy (the green check)", async () => {
    await mount();
    expect(container.textContent).toContain("Available offline");
    expect(container.textContent).toContain("green check");
  });
});

describe("editor error boundary — online", () => {
  it("an ONLINE crash still surfaces as a real error, not a connectivity excuse", async () => {
    online = true;
    await mount();
    expect(container.textContent).toContain("Something went wrong");
    expect(container.textContent).not.toContain("isn’t available offline");
  });

  it("on the web (non-native) it is always the normal error UI", async () => {
    native = false;
    online = false;
    await mount();
    expect(container.textContent).toContain("Something went wrong");
  });
});
