/**
 * copy_play tool — input validation + delegation contract.
 *
 * The actual cross-playbook copy logic lives in `copyPlayAction`
 * (src/app/actions/plays.ts), which has its own coverage in the
 * server-actions test layer. These tests pin the Cal-tool wrapper:
 *   - input shape rejection (missing args, bad target UUID, blank ref)
 *   - UUID source lookup hits the plays table
 *   - slot/name source lookup requires an anchored playbook
 *   - delegated call uses formationMode="copy" (the safe default)
 *   - successful response includes a clickable [Open the copy] link
 *   - dropped-route count + formation-rename are surfaced when present
 *   - source/target same-id collision is rejected
 *
 * Surfaced 2026-05-09 (ge.montiel transcript): coach asked Cal to move
 * a play between playbooks; Cal said "I don't have a tool" and pushed
 * a manual copy/paste workaround. This file pins the tool's contract
 * so that regression doesn't return.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ToolContext } from "./tools";

type CopyResult =
  | {
      ok: true;
      playId: string;
      playbookId: string;
      droppedRouteCount: number;
      formationRenamed: boolean;
      formationNewName: string | null;
    }
  | { ok: false; error: string };

type PlaysRow = { id: string; name: string | null; playbook_id: string } | null;

const copyPlayActionMock = vi.fn<(p: unknown) => Promise<CopyResult>>();
const adminMaybeSingleMock = vi.fn<() => Promise<{ data: PlaysRow; error: { message: string } | null }>>();

vi.mock("@/app/actions/plays", () => ({
  copyPlayAction: (p: unknown) => copyPlayActionMock(p),
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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    rpc: () => Promise.resolve({ data: true, error: null }),
  })),
}));

import { PLAY_TOOLS } from "./play-tools";

const SRC_PLAY_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_PB_ID = "44444444-4444-4444-8444-444444444444";
const ANCHORED_PB_ID = "55555555-5555-4555-8555-555555555555";

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

function getCopyPlay() {
  const tool = PLAY_TOOLS.find((t) => t.def.name === "copy_play");
  if (!tool) throw new Error("copy_play tool not registered in PLAY_TOOLS");
  return tool;
}

beforeEach(() => {
  copyPlayActionMock.mockReset();
  adminMaybeSingleMock.mockReset();
});

describe("copy_play — registration + schema", () => {
  it("is registered in PLAY_TOOLS", () => {
    expect(getCopyPlay()).toBeDefined();
  });

  it("requires both play_id and target_playbook_id", () => {
    const schema = getCopyPlay().def.input_schema as { required?: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(["play_id", "target_playbook_id"]));
  });
});

describe("copy_play — input validation", () => {
  it("rejects when play_id is missing", async () => {
    const tool = getCopyPlay();
    const r = await tool.handler({ target_playbook_id: TARGET_PB_ID }, ctxFor());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/play_id is required/i);
    expect(copyPlayActionMock).not.toHaveBeenCalled();
  });

  it("rejects when target_playbook_id is not a UUID", async () => {
    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: SRC_PLAY_ID, target_playbook_id: "not-a-uuid" },
      ctxFor(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/target_playbook_id must be a UUID/i);
    expect(copyPlayActionMock).not.toHaveBeenCalled();
  });

  it("rejects when play_id and target_playbook_id are the same UUID", async () => {
    adminMaybeSingleMock.mockResolvedValue({
      data: { id: TARGET_PB_ID, name: "Self", playbook_id: ANCHORED_PB_ID },
      error: null,
    });
    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: TARGET_PB_ID, target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/same/i);
    expect(copyPlayActionMock).not.toHaveBeenCalled();
  });
});

describe("copy_play — source resolution", () => {
  it("looks up a UUID source in the plays table and delegates with formationMode=copy", async () => {
    adminMaybeSingleMock.mockResolvedValue({
      data: { id: SRC_PLAY_ID, name: "Screen", playbook_id: ANCHORED_PB_ID },
      error: null,
    });
    copyPlayActionMock.mockResolvedValue({
      ok: true,
      playId: "new-play",
      playbookId: TARGET_PB_ID,
      droppedRouteCount: 0,
      formationRenamed: false,
      formationNewName: null,
    });

    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: SRC_PLAY_ID, target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(true);
    expect(copyPlayActionMock).toHaveBeenCalledWith({
      playId: SRC_PLAY_ID,
      destinationPlaybookId: TARGET_PB_ID,
      formationMode: "copy",
    });
  });

  it("rejects a UUID source that does not exist", async () => {
    adminMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: SRC_PLAY_ID, target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/i);
    expect(copyPlayActionMock).not.toHaveBeenCalled();
  });

  it("rejects a slot/name reference when chat has no anchored source playbook", async () => {
    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: "Recommended #5", target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/anchored/i);
      expect(r.error).toMatch(/UUID/i);
    }
    expect(copyPlayActionMock).not.toHaveBeenCalled();
  });
});

describe("copy_play — success messaging", () => {
  it("includes a clickable [Open the copy] link in the success result", async () => {
    adminMaybeSingleMock.mockResolvedValue({
      data: { id: SRC_PLAY_ID, name: "Smash", playbook_id: ANCHORED_PB_ID },
      error: null,
    });
    copyPlayActionMock.mockResolvedValue({
      ok: true,
      playId: "abc12345-abc1-4abc-8abc-abc123456789",
      playbookId: TARGET_PB_ID,
      droppedRouteCount: 0,
      formationRenamed: false,
      formationNewName: null,
    });

    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: SRC_PLAY_ID, target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result).toMatch(/\[Open the copy\]\(\/plays\/abc12345-abc1-4abc-8abc-abc123456789\/edit\)/);
      expect(r.result).toMatch(/source play in the original playbook is unchanged/i);
    }
  });

  it("surfaces dropped-route count when copyPlayAction reports any", async () => {
    adminMaybeSingleMock.mockResolvedValue({
      data: { id: SRC_PLAY_ID, name: "Smash", playbook_id: ANCHORED_PB_ID },
      error: null,
    });
    copyPlayActionMock.mockResolvedValue({
      ok: true,
      playId: "new-play",
      playbookId: TARGET_PB_ID,
      droppedRouteCount: 2,
      formationRenamed: false,
      formationNewName: null,
    });

    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: SRC_PLAY_ID, target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toMatch(/Dropped 2 route\(s\)/);
  });

  it("surfaces a formation rename when copyPlayAction reports one", async () => {
    adminMaybeSingleMock.mockResolvedValue({
      data: { id: SRC_PLAY_ID, name: "Smash", playbook_id: ANCHORED_PB_ID },
      error: null,
    });
    copyPlayActionMock.mockResolvedValue({
      ok: true,
      playId: "new-play",
      playbookId: TARGET_PB_ID,
      droppedRouteCount: 0,
      formationRenamed: true,
      formationNewName: "Spread Doubles (copy)",
    });

    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: SRC_PLAY_ID, target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result).toMatch(/Formation was renamed/i);
      expect(r.result).toMatch(/Spread Doubles \(copy\)/);
    }
  });
});

describe("copy_play — delegated failure propagates", () => {
  it("returns ok=false with the underlying error when copyPlayAction fails", async () => {
    adminMaybeSingleMock.mockResolvedValue({
      data: { id: SRC_PLAY_ID, name: "Smash", playbook_id: ANCHORED_PB_ID },
      error: null,
    });
    copyPlayActionMock.mockResolvedValue({
      ok: false,
      error: "You don't have permission to add plays to that playbook.",
    });

    const tool = getCopyPlay();
    const r = await tool.handler(
      { play_id: SRC_PLAY_ID, target_playbook_id: TARGET_PB_ID },
      ctxFor(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/permission/i);
  });
});
