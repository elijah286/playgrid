// @vitest-environment jsdom
/**
 * Cal's "Add to this play" chip must not wedge when the save fails.
 *
 * THE BUG (2026-07-16, found while auditing the offline opponent crash): the
 * chip is the THIRD way to install an opponent, alongside the two in
 * OpponentOverlayCard. All three converge on createCustomOpponentAction, but
 * only the card's six sites were fixed — the chip was missed because it lives in
 * a different feature folder and uses neither a transition nor a toast:
 *
 *     setPending(mode);
 *     const res = await commitAttachDefenseToPlayAction(...);
 *     setPending(null);                  // never ran when the await REJECTED
 *
 * Offline the action does not RETURN ok:false — it THROWS ("Load failed"). So
 * pending stayed latched: the chip read "Adding…" forever with BOTH buttons
 * disabled and no error shown. Unlike the card's crash this is silent, which is
 * worse in one specific way — the coach's only escape was closing the chat, and
 * closing the chat discards the proposal. Cal's nav button is offline-gated, so
 * the reachable case is losing signal with the chat already open.
 *
 * These tests mount the REAL chip rather than a replica of the pattern. The
 * pattern was already known-bad and documented twice before this bug (see
 * editorOfflineResilience.test.tsx and opponentOverlayOffline.test.tsx) — it was
 * the CALL SITE that was missed, and only a real mount defends a call site.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const attach = vi.fn();
const saveNew = vi.fn();
vi.mock("@/app/actions/coach-ai-save-defense", () => ({
  commitAttachDefenseToPlayAction: (...a: unknown[]) => attach(...a),
  commitSaveDefenseProposalAction: (...a: unknown[]) => saveNew(...a),
}));

import { SaveDefensePlayChip } from "./CoachAiChat";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const PROPOSAL = {
  suggestedName: "Cover 2 vs Mesh",
  changeSummary: "Two-high shell, corners squat",
  offensivePlayName: "Mesh",
} as unknown as Parameters<typeof SaveDefensePlayChip>[0]["proposal"];

let container: HTMLDivElement;
let root: Root;

function mount(node: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

function buttonWith(text: string) {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

async function clickAndSettle(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("SaveDefensePlayChip — offline", () => {
  it("unwedges the spinner when the action THROWS", async () => {
    // Offline reality: a rejected fetch, not a tidy { ok: false }.
    attach.mockRejectedValue(new TypeError("Load failed"));

    mount(
      <SaveDefensePlayChip
        proposal={PROPOSAL}
        playbookId="pb-1"
        state={null}
        onUpdate={vi.fn()}
      />,
    );

    await clickAndSettle(buttonWith("Add to this play")!);

    expect(
      buttonWith("Adding…"),
      'pending must reset — "Adding…" forever with both buttons dead was the bug',
    ).toBeFalsy();
    expect(buttonWith("Add to this play")?.disabled, "the coach must be able to retry").toBe(false);
  });

  it("tells the coach it may be offline instead of failing silently", async () => {
    attach.mockRejectedValue(new TypeError("Load failed"));

    mount(
      <SaveDefensePlayChip
        proposal={PROPOSAL}
        playbookId="pb-1"
        state={null}
        onUpdate={vi.fn()}
      />,
    );

    await clickAndSettle(buttonWith("Add to this play")!);

    expect(container.textContent).toContain("you may be offline");
  });

  it("keeps the proposal so a retry online costs nothing", async () => {
    attach.mockRejectedValue(new TypeError("Load failed"));
    const onUpdate = vi.fn();

    mount(
      <SaveDefensePlayChip
        proposal={PROPOSAL}
        playbookId="pb-1"
        state={null}
        onUpdate={onUpdate}
      />,
    );

    await clickAndSettle(buttonWith("Add to this play")!);

    // Closing the chat is what discards the proposal; a failed save must not
    // advance chip state toward saved/dismissed on the coach's behalf.
    expect(onUpdate, "a failed save must not mutate proposal state").not.toHaveBeenCalled();
    expect(container.textContent).toContain("Cover 2 vs Mesh");
  });

  it("still attaches normally when the action succeeds", async () => {
    attach.mockResolvedValue({ ok: true, playId: "play-9" });
    const onUpdate = vi.fn();

    mount(
      <SaveDefensePlayChip
        proposal={PROPOSAL}
        playbookId="pb-1"
        state={null}
        onUpdate={onUpdate}
      />,
    );

    await clickAndSettle(buttonWith("Add to this play")!);

    expect(onUpdate).toHaveBeenCalledWith({ status: "saved", mode: "attached", playId: "play-9" });
  });

  it("tolerates ok:false without wedging either", async () => {
    attach.mockResolvedValue({ ok: false, error: "That play is locked." });

    mount(
      <SaveDefensePlayChip
        proposal={PROPOSAL}
        playbookId="pb-1"
        state={null}
        onUpdate={vi.fn()}
      />,
    );

    await clickAndSettle(buttonWith("Add to this play")!);

    expect(container.textContent).toContain("That play is locked.");
    expect(buttonWith("Adding…")).toBeFalsy();
  });
});
