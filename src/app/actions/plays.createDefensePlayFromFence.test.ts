/**
 * createDefensePlayFromFenceAction — permission RPC contract.
 *
 * Surfaced 2026-05-29: a coach asked Cal to "install a cover 2 defense"
 * and Cal's "save as a new defensive play" path threw a user-facing
 * error. Root cause: the permission check called the `can_edit_playbook`
 * RPC with `{ p_playbook_id }`, but the Postgres function's parameter is
 * named `pb`. PostgREST resolves overloads by parameter NAME, so the call
 * 404'd with "Could not find the function public.can_edit_playbook(
 * p_playbook_id) in the schema cache." Every other call site in the
 * codebase uses `{ pb }`; this one had drifted.
 *
 * This test pins the arg name so the drift can't return: the action MUST
 * invoke can_edit_playbook with exactly `{ pb: playbookId }`.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Supabase server client — capture every rpc() call so we can assert
// the permission check's parameter name.
const userMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => userMock() },
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  })),
}));

// hasSupabaseEnv() gates the action before it does anything; force it on.
vi.mock("@/lib/supabase/config", () => ({
  hasSupabaseEnv: () => true,
}));

// next/cache is imported at module top-level (revalidatePath, unstable_cache).
// Neither is reached before the permission short-circuit, but the import must
// resolve under vitest.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { createDefensePlayFromFenceAction } from "./plays";

const PLAYBOOK_ID = "66666666-6666-4666-8666-666666666666";
const OFFENSE_PLAY_ID = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  userMock.mockReset();
  rpcMock.mockReset();
});

describe("createDefensePlayFromFenceAction — permission RPC", () => {
  it("calls can_edit_playbook with { pb } (not { p_playbook_id })", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    // Return false so the action short-circuits at the permission gate —
    // we only need to assert how the RPC was invoked.
    rpcMock.mockResolvedValue({ data: false, error: null });

    const result = await createDefensePlayFromFenceAction({
      fenceJson: "{}",
      offensivePlayId: OFFENSE_PLAY_ID,
      suggestedName: "Cover 2 v Flood Right",
      playbookId: PLAYBOOK_ID,
    });

    // Permission denied → clean ok:false, NOT a thrown schema-cache 404.
    expect(result.ok).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith("can_edit_playbook", { pb: PLAYBOOK_ID });
    // The drifted key must never appear.
    expect(rpcMock).not.toHaveBeenCalledWith(
      "can_edit_playbook",
      expect.objectContaining({ p_playbook_id: expect.anything() }),
    );
  });

  it("surfaces a permission error (not a thrown RPC failure) when access is denied", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: false, error: null });

    const result = await createDefensePlayFromFenceAction({
      fenceJson: "{}",
      offensivePlayId: OFFENSE_PLAY_ID,
      suggestedName: "Cover 2 v Flood Right",
      playbookId: PLAYBOOK_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/edit access/i);
  });
});
