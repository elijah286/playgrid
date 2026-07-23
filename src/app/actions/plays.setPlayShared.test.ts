/**
 * setPlaySharedAction / setPlaybookPlaysSharedAction — coach gate.
 *
 * Workstream 2 (opt-in play sharing). The RLS split does the real
 * viewer-side enforcement (verified manually against the DB); these actions
 * just flip the flags and MUST be gated to coaches (owner/editor). This test
 * pins that gate: a viewer is rejected with a friendly error and no write
 * happens; an owner/editor writes the exact flag column.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const userMock = vi.fn();
const playLookupMock = vi.fn();
const membershipMock = vi.fn();
const playUpdateMock = vi.fn();
const bookUpdateMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => userMock() },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () =>
        table === "playbook_members" ? membershipMock() : playLookupMock();
      chain.update = (vals: unknown) => ({
        eq: () => (table === "plays" ? playUpdateMock(vals) : bookUpdateMock(vals)),
      });
      return chain;
    },
  })),
}));

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { setPlaySharedAction, setPlaybookPlaysSharedAction } from "./plays";

const PLAYBOOK_ID = "66666666-6666-4666-8666-666666666666";
const PLAY_ID = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  userMock.mockReset();
  playLookupMock.mockReset();
  membershipMock.mockReset();
  playUpdateMock.mockReset();
  bookUpdateMock.mockReset();
  userMock.mockResolvedValue({ data: { user: { id: "coach-1" } } });
  playLookupMock.mockResolvedValue({ data: { playbook_id: PLAYBOOK_ID } });
  playUpdateMock.mockResolvedValue({ error: null });
  bookUpdateMock.mockResolvedValue({ error: null });
});

describe("setPlaySharedAction", () => {
  it("rejects a signed-out caller", async () => {
    userMock.mockResolvedValue({ data: { user: null } });
    const res = await setPlaySharedAction(PLAY_ID, false);
    expect(res.ok).toBe(false);
    expect(playUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a viewer (non-coach) without writing", async () => {
    membershipMock.mockResolvedValue({ data: { role: "viewer" } });
    const res = await setPlaySharedAction(PLAY_ID, false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/coach/i);
    expect(playUpdateMock).not.toHaveBeenCalled();
  });

  it("lets an owner flip the per-play flag", async () => {
    membershipMock.mockResolvedValue({ data: { role: "owner" } });
    const res = await setPlaySharedAction(PLAY_ID, false);
    expect(res.ok).toBe(true);
    expect(playUpdateMock).toHaveBeenCalledWith({ shared_with_players: false });
  });

  it("lets an editor flip the per-play flag", async () => {
    membershipMock.mockResolvedValue({ data: { role: "editor" } });
    const res = await setPlaySharedAction(PLAY_ID, true);
    expect(res.ok).toBe(true);
    expect(playUpdateMock).toHaveBeenCalledWith({ shared_with_players: true });
  });
});

describe("setPlaybookPlaysSharedAction", () => {
  it("rejects a viewer without writing", async () => {
    membershipMock.mockResolvedValue({ data: { role: "viewer" } });
    const res = await setPlaybookPlaysSharedAction(PLAYBOOK_ID, false);
    expect(res.ok).toBe(false);
    expect(bookUpdateMock).not.toHaveBeenCalled();
  });

  it("lets an owner flip the master switch", async () => {
    membershipMock.mockResolvedValue({ data: { role: "owner" } });
    const res = await setPlaybookPlaysSharedAction(PLAYBOOK_ID, false);
    expect(res.ok).toBe(true);
    expect(bookUpdateMock).toHaveBeenCalledWith({ plays_shared_with_players: false });
  });
});
