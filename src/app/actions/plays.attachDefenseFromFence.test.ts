/**
 * attachDefenseFromFenceAction + commitAttachDefenseToPlayAction — the
 * "Add to this play" half of the post-compose_defense save chip.
 *
 * Surfaced 2026-05-29: a coach asked Cal to "install a cover 2 defense and
 * show me how the defenders should move", expecting to SEE the overlay and
 * then choose between (1) attaching it to the play or (2) saving it as a new
 * defense play. Cal instead auto-saved silently AND surfaced an error. The
 * fix adds an OFFER chip with both buttons; this action backs button (1).
 *
 * These pin two contracts:
 *   - Permission RPC arg name: `can_edit_playbook` resolves overloads by
 *     parameter NAME, so the call MUST use `{ pb }` (the same drift that
 *     broke createDefensePlayFromFenceAction — see its sibling test).
 *   - Defense-only stripping: the action keeps only team:"D" players before
 *     handing off to createCustomOpponentAction. A fence with no defenders is
 *     rejected cleanly instead of attaching an empty opponent.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const userMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => userMock() },
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  })),
}));

vi.mock("@/lib/supabase/config", () => ({
  hasSupabaseEnv: () => true,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { attachDefenseFromFenceAction } from "./plays";
import { commitAttachDefenseToPlayAction } from "./coach-ai-save-defense";
import type { SaveDefenseProposal } from "@/lib/coach-ai/save-defense-tools";

const PLAYBOOK_ID = "66666666-6666-4666-8666-666666666666";
const OFFENSE_PLAY_ID = "77777777-7777-4777-8777-777777777777";

// A valid CoachDiagram with offense only (no team:"D" players). Strips to
// zero defenders, so the "no defenders" guard fires AFTER the parse — which
// proves the fence flowed through parsing without reaching the DB.
const OFFENSE_ONLY_FENCE = JSON.stringify({
  title: "Flood Right",
  variant: "flag_7v7",
  players: [
    { id: "QB", x: 0, y: -3, team: "O" },
    { id: "Z", x: 12, y: 0, team: "O" },
  ],
  routes: [{ from: "Z", path: [[12, 18]], tip: "arrow" }],
});

beforeEach(() => {
  userMock.mockReset();
  rpcMock.mockReset();
});

describe("attachDefenseFromFenceAction — permission RPC", () => {
  it("calls can_edit_playbook with { pb } (not { p_playbook_id })", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: false, error: null });

    const result = await attachDefenseFromFenceAction({
      fenceJson: OFFENSE_ONLY_FENCE,
      offensivePlayId: OFFENSE_PLAY_ID,
      playbookId: PLAYBOOK_ID,
    });

    expect(result.ok).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith("can_edit_playbook", { pb: PLAYBOOK_ID });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "can_edit_playbook",
      expect.objectContaining({ p_playbook_id: expect.anything() }),
    );
  });

  it("surfaces a clean permission error when access is denied", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: false, error: null });

    const result = await attachDefenseFromFenceAction({
      fenceJson: OFFENSE_ONLY_FENCE,
      offensivePlayId: OFFENSE_PLAY_ID,
      playbookId: PLAYBOOK_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/edit access/i);
  });
});

describe("attachDefenseFromFenceAction — defense stripping", () => {
  it("rejects a fence with no defenders instead of attaching an empty opponent", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    // Permission GRANTED — we want execution to reach the strip + guard.
    rpcMock.mockResolvedValue({ data: true, error: null });

    const result = await attachDefenseFromFenceAction({
      fenceJson: OFFENSE_ONLY_FENCE,
      offensivePlayId: OFFENSE_PLAY_ID,
      playbookId: PLAYBOOK_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no defenders/i);
  });
});

describe("commitAttachDefenseToPlayAction — wrapper plumbing", () => {
  it("forwards the proposal's fence + playbook to the attach action", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: true, error: null });

    const proposal: SaveDefenseProposal = {
      proposalId: "p-1",
      defenseFenceJson: OFFENSE_ONLY_FENCE,
      offensivePlayId: OFFENSE_PLAY_ID,
      offensivePlayName: "Flood Right",
      suggestedName: "Cover 2 vs Flood Right",
      changeSummary: "Cover 2 overlaid on Flood Right",
    };

    const result = await commitAttachDefenseToPlayAction(PLAYBOOK_ID, proposal);

    // The wrapper reached attachDefenseFromFenceAction (RPC fired with the
    // playbook id) and the fence flowed through to the no-defenders guard.
    expect(rpcMock).toHaveBeenCalledWith("can_edit_playbook", { pb: PLAYBOOK_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no defenders/i);
  });
});
