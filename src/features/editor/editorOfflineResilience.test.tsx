// @vitest-environment jsdom
/**
 * A best-effort refresh must never take down the play editor.
 *
 * THE BUG (2026-07-16, real iPad, found after two days and four wrong theories):
 * offline, opening a downloaded play painted the real editor for ~100ms — the
 * correct play — then replaced it with "This play isn't available offline".
 *
 * The cause was EditorHeaderBar's mount effect:
 *
 *     useEffect(() => {
 *       startTransition(async () => {
 *         const res = await listPlaybookPlaysForNavigationAction(playbookId);
 *         if (res.ok) { ... }              // only ok:false was handled
 *       });
 *     }, [playId]);
 *
 * Offline the `await` REJECTS ("Load failed" — WebKit's rejected-fetch message,
 * which carries no usable stack, which is why the crash could never name its own
 * cause). A rejected await inside startTransition is NOT contained: React 19
 * propagates transition errors to the nearest error boundary. So a cosmetic
 * sibling-nav refresh destroyed the whole editor. The comment above it even said
 * "Cheap best-effort; ignore result if it fails" — it ignored a false `ok`, never
 * a throw.
 *
 * The distinction this pins: `.then()` without `.catch()` is an unhandled
 * rejection (noisy, survivable); `startTransition(async () => { await x })`
 * without a try/catch is a PAGE CRASH. There are ~205 startTransition(async)
 * sites in this codebase — the mount-time ones are the dangerous ones, because
 * they fire with no user asking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const listNav = vi.fn();
vi.mock("@/app/actions/plays", () => ({
  listPlaybookPlaysForNavigationAction: (...a: unknown[]) => listNav(...a),
}));

import { startTransition, useEffect, useState } from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The exact shape of EditorHeaderBar's mount effect, fixed: the await is inside
 * a try/catch. Reproduced here rather than mounting the real 3000-line editor,
 * which would need dozens of unrelated props — the PATTERN is what regressed.
 */
function NavRefresher({ onNav }: { onNav: (n: unknown[]) => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    startTransition(async () => {
      try {
        const res = await listNav("pb-1");
        if (res.ok) onNav(res.plays);
      } catch {
        // best-effort — the initial nav came from props
      }
      setReady(true);
    });
  }, [onNav]);
  return <div>{ready ? "editor ready" : "editor"}</div>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("editor mount refresh, offline", () => {
  it("SURVIVES a rejected server action (the crash that emptied the editor)", async () => {
    // "Load failed" is what WebKit throws for a dead fetch with no signal.
    listNav.mockRejectedValue(new TypeError("Load failed"));
    const onError = vi.fn();
    window.addEventListener("error", onError);

    await act(async () => {
      root.render(<NavRefresher onNav={() => {}} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    window.removeEventListener("error", onError);
    // The editor is still standing. Pre-fix, the rejection escaped the
    // transition and unmounted this entire subtree into the error boundary.
    expect(container.textContent).toContain("editor");
    expect(onError).not.toHaveBeenCalled();
  });

  it("still applies the nav when the action DOES succeed", async () => {
    listNav.mockResolvedValue({ ok: true, plays: [{ id: "p1" }], groups: [] });
    const onNav = vi.fn();

    await act(async () => {
      root.render(<NavRefresher onNav={onNav} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The catch must not have neutered the feature it guards.
    expect(onNav).toHaveBeenCalledWith([{ id: "p1" }]);
  });

  it("tolerates ok:false without crashing either", async () => {
    listNav.mockResolvedValue({ ok: false, error: "nope" });
    const onNav = vi.fn();

    await act(async () => {
      root.render(<NavRefresher onNav={onNav} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onNav).not.toHaveBeenCalled();
    expect(container.textContent).toContain("editor");
  });
});
