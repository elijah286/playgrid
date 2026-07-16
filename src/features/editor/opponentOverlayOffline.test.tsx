// @vitest-environment jsdom
/**
 * The opponent overlay card must never take down the play editor.
 *
 * THE BUG (2026-07-16, real iPad, offline): tapping anything in the OPPONENT
 * card destroyed the editor. Same shape as the EditorHeaderBar crash documented
 * in editorOfflineResilience.test.tsx — and found the same day. That sweep fixed
 * the mount-time site; these six user-triggered ones were missed:
 *
 *     startTransition(async () => {
 *       const res = await getPlayForEditorAction(p.id);
 *       if (!res.ok) { ... }              // only ok:false was handled
 *     });
 *
 * Offline the action does not RETURN ok:false — it THROWS ("Load failed", the
 * WebKit rejected-fetch message). React 19 propagates a rejected transition to
 * the nearest error boundary, so a view-only ghost overlay took out the page.
 *
 * All six sites are in this file and use three different transition setters
 * (startTransition, startCustomPending, startInstall) — which is precisely why
 * a grep for `startTransition(async` finds one of six. The lesson worth pinning:
 * the hazard is `await` inside ANY transition scope, not a particular setter name.
 *
 * These tests mount the REAL component. A pattern-replica test (the right call
 * for the 3000-line editor next door) would not have caught this, because the
 * pattern was already known-bad — it was these call sites that were missed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Component, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const getPlay = vi.fn();
vi.mock("@/app/actions/plays", () => ({
  getPlayForEditorAction: (...a: unknown[]) => getPlay(...a),
}));

const toast = vi.fn();
vi.mock("@/components/ui", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/features/tutorials/engine/notify", () => ({
  notifyTutorialAction: vi.fn(),
}));

import { OpponentOverlayCard } from "./OpponentOverlayCard";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** Stands in for src/app/(editor)/plays/[playId]/edit/error.tsx. */
class Boundary extends Component<{ children: ReactNode; onCatch: () => void }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() {
    return { dead: true };
  }
  componentDidCatch() {
    this.props.onCatch();
  }
  render() {
    return this.state.dead ? <p>Something went wrong</p> : this.props.children;
  }
}

const NAV_PLAY = {
  id: "play-def-1",
  name: "Cover 2 No Rush",
  play_type: "defense",
  current_version_id: "v1",
  formation_name: "Cover 2",
  concept: "",
  wristband_code: "",
  shorthand: "",
} as unknown as Parameters<typeof OpponentOverlayCard>[0]["nav"][number];

let container: HTMLDivElement;
let root: Root;

function mount(node: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("OpponentOverlayCard — offline resilience", () => {
  it("survives the server action THROWING when a play row is tapped", async () => {
    // Offline reality: a rejected fetch, not a tidy { ok: false }.
    getPlay.mockRejectedValue(new TypeError("Load failed"));
    const onCatch = vi.fn();

    mount(
      <Boundary onCatch={onCatch}>
        <OpponentOverlayCard
          currentPlayId="play-off-1"
          currentPlaybookId="pb-1"
          playType="offense"
          nav={[NAV_PLAY]}
          allFormations={[]}
          hasSelection={false}
          onChange={vi.fn()}
        />
      </Boundary>,
    );

    const row = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Cover 2 No Rush"),
    );
    expect(row, "the play row should render from props (nav is baked into the RSC payload)").toBeTruthy();

    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onCatch, "a rejected transition must not reach the error boundary").not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Something went wrong");
  });

  it("tells the coach the pick failed instead of failing silently", async () => {
    getPlay.mockRejectedValue(new TypeError("Load failed"));

    mount(
      <OpponentOverlayCard
        currentPlayId="play-off-1"
        currentPlaybookId="pb-1"
        playType="offense"
        nav={[NAV_PLAY]}
        allFormations={[]}
        hasSelection={false}
        onChange={vi.fn()}
      />,
    );

    const row = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Cover 2 No Rush"),
    );
    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(toast, "a swallowed error is a stuck spinner — say something").toHaveBeenCalled();
  });
});
