/**
 * Targeted-save resolver tests — `resolveTargetPlaybook`.
 *
 * The resolver is the gate that lets `create_play` accept an explicit
 * `playbook_id` arg so Cal can save plays from a global (unanchored)
 * thread. Surfaced 2026-05-10: the bhbfearless trial conversation
 * generated 6 plays in chat, said "save all to playbook", and Cal
 * had no way to land them — `ctx.playbookId` was null and the tool
 * couldn't be exposed. Result was a told-to-navigate-and-come-back
 * dead end mid-conversation. The resolver makes cross-playbook saves
 * legal as long as `can_edit_playbook` says yes.
 *
 * Cases covered:
 *   1. Anchored, no explicit id → use ctx values (the legacy path).
 *   2. Anchored, explicit id == ctx.playbookId → behave as anchored.
 *   3. Unanchored, no explicit id → reject with a clear "pass playbook_id" hint.
 *   4. Anchored without edit access, no explicit id → reject.
 *   5. Cross-playbook id, can_edit_playbook=true → use the new id + variant.
 *   6. Cross-playbook id, can_edit_playbook=false → reject.
 *   7. Cross-playbook id, not signed in → reject.
 *   8. Garbage explicit id (not a UUID) → fall through to anchored path.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ToolContext } from "./tools";

// ── Supabase + admin mocks ─────────────────────────────────────────
type RpcResult = { data: unknown; error: { message: string } | null };
type MaybeSingleResult = { data: unknown; error: { message: string } | null };

const userMock = vi.fn();
const rpcMock = vi.fn();
const adminMaybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => userMock() },
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => adminMaybeSingleMock() }),
      }),
    }),
  })),
}));

import { resolveTargetPlaybook } from "./play-tools";

const ANCHORED_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function ctxFor(opts: Partial<ToolContext> = {}): ToolContext {
  return {
    playbookId: null,
    playbookName: null,
    sportVariant: null,
    gameLevel: null,
    sanctioningBody: null,
    ageDivision: null,
    playbookSettings: null,
    isAdmin: false,
    canEditPlaybook: false,
    mode: "normal",
    timezone: null,
    playId: null,
    playName: null,
    playFormation: null,
    playDiagramText: null,
    playDiagramRecap: null,
    ...opts,
  };
}

beforeEach(() => {
  userMock.mockReset();
  rpcMock.mockReset();
  adminMaybeSingleMock.mockReset();
});

describe("resolveTargetPlaybook", () => {
  it("uses ctx values when no explicit id is provided and chat is anchored", async () => {
    const ctx = ctxFor({
      playbookId: ANCHORED_ID,
      canEditPlaybook: true,
      sportVariant: "flag_7v7",
    });
    const result = await resolveTargetPlaybook(undefined, ctx);
    expect(result).toEqual({ ok: true, playbookId: ANCHORED_ID, sportVariant: "flag_7v7" });
    // Did NOT call DB — anchored case is pure ctx.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("treats explicit id matching ctx.playbookId as anchored (no extra DB hop)", async () => {
    const ctx = ctxFor({
      playbookId: ANCHORED_ID,
      canEditPlaybook: true,
      sportVariant: "flag_5v5",
    });
    const result = await resolveTargetPlaybook(ANCHORED_ID, ctx);
    expect(result).toEqual({ ok: true, playbookId: ANCHORED_ID, sportVariant: "flag_5v5" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects with a clear hint when unanchored and no playbook_id was passed", async () => {
    const ctx = ctxFor();
    const result = await resolveTargetPlaybook(undefined, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/playbook_id/i);
    }
  });

  it("rejects when anchored without edit access and no override is passed", async () => {
    const ctx = ctxFor({ playbookId: ANCHORED_ID, canEditPlaybook: false });
    const result = await resolveTargetPlaybook(undefined, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/edit access/i);
    }
  });

  it("falls through to anchored path when explicit id is not a UUID", async () => {
    const ctx = ctxFor({
      playbookId: ANCHORED_ID,
      canEditPlaybook: true,
      sportVariant: "flag_7v7",
    });
    const result = await resolveTargetPlaybook("not-a-uuid", ctx);
    expect(result).toEqual({ ok: true, playbookId: ANCHORED_ID, sportVariant: "flag_7v7" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("accepts a cross-playbook id when can_edit_playbook returns true", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: true, error: null } satisfies RpcResult);
    adminMaybeSingleMock.mockResolvedValue({
      data: { sport_variant: "flag_5v5" },
      error: null,
    } satisfies MaybeSingleResult);

    const ctx = ctxFor({ playbookId: ANCHORED_ID, canEditPlaybook: true, sportVariant: "flag_7v7" });
    const result = await resolveTargetPlaybook(TARGET_ID, ctx);
    expect(result).toEqual({ ok: true, playbookId: TARGET_ID, sportVariant: "flag_5v5" });
    expect(rpcMock).toHaveBeenCalledWith("can_edit_playbook", { pb: TARGET_ID });
  });

  it("rejects when can_edit_playbook returns false", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: false, error: null } satisfies RpcResult);

    const ctx = ctxFor();
    const result = await resolveTargetPlaybook(TARGET_ID, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/edit access/i);
    }
    // Don't bother fetching the playbook row if permission failed.
    expect(adminMaybeSingleMock).not.toHaveBeenCalled();
  });

  it("rejects when no user is signed in", async () => {
    userMock.mockResolvedValue({ data: { user: null } });
    const ctx = ctxFor();
    const result = await resolveTargetPlaybook(TARGET_ID, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/signed in/i);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects when the playbook row is missing even though permission passed", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: true, error: null } satisfies RpcResult);
    adminMaybeSingleMock.mockResolvedValue({ data: null, error: null } satisfies MaybeSingleResult);

    const ctx = ctxFor();
    const result = await resolveTargetPlaybook(TARGET_ID, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not found/i);
    }
  });

  it("returns null sportVariant when the target playbook has none set", async () => {
    userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: true, error: null } satisfies RpcResult);
    adminMaybeSingleMock.mockResolvedValue({
      data: { sport_variant: null },
      error: null,
    } satisfies MaybeSingleResult);

    const ctx = ctxFor();
    const result = await resolveTargetPlaybook(TARGET_ID, ctx);
    expect(result).toEqual({ ok: true, playbookId: TARGET_ID, sportVariant: null });
  });
});
