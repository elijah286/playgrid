import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * getPlaybookOfflineBundleAction — "Make available offline".
 *
 * Regression (2026-07-15 → 07-16, prod): the select asked for
 * `playbooks.created_by`, a column that does not exist (ownership lives in
 * playbook_members.role='owner'). PostgREST rejects the whole query with a 400
 * (42703), Supabase surfaces that as `data: null`, and the action's `if (!book)`
 * branch reported "Playbook not found." — so EVERY download, for EVERY coach, on
 * EVERY device failed with a message that blamed the coach's playbook for our
 * schema mistake. A fresh iPad reproduced it instantly.
 *
 * Two guards here:
 *  1. A query ERROR must never be reported as "not found" — that disguise is
 *     what hid the bug for a day.
 *  2. The owner label resolves via playbook_members(role='owner') → profiles,
 *     the same path the online editor header uses.
 */

const getUserMock = vi.fn();
const listPlaysMock = vi.fn();
const playbooksMaybeSingle = vi.fn();
const membersMaybeSingle = vi.fn();
const profilesMaybeSingle = vi.fn();
const playsIn = vi.fn();
const versionsIn = vi.fn();
/** Captured so we can assert we never ask for a phantom column again. */
let playbooksSelectArg = "";

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => getUserMock() },
    from: (table: string) => {
      switch (table) {
        case "playbooks":
          return {
            select: (cols: string) => {
              playbooksSelectArg = cols;
              return { eq: () => ({ maybeSingle: () => playbooksMaybeSingle() }) };
            },
          };
        case "playbook_members":
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ limit: () => ({ maybeSingle: () => membersMaybeSingle() }) }),
              }),
            }),
          };
        case "profiles":
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => profilesMaybeSingle() }) }),
          };
        case "plays":
          return { select: () => ({ in: () => playsIn() }) };
        case "play_versions":
          return { select: () => ({ in: () => versionsIn() }) };
        default:
          throw new Error(`unexpected table: ${table}`);
      }
    },
  })),
}));

vi.mock("@/app/actions/plays", () => ({
  listPlaysAction: (...a: unknown[]) => listPlaysMock(...a),
}));

import { getPlaybookOfflineBundleAction } from "./offline";

const BOOK = {
  id: "pb-1",
  name: "7v7 Example",
  season: "2026",
  sport_variant: "flag_7v7",
  color: "#134e2a",
  logo_url: null, // null → no image fetch, keeps the test hermetic
  is_example: true,
  is_public_example: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  playbooksSelectArg = "";
  getUserMock.mockResolvedValue({ data: { user: { id: "coach-1" } }, error: null });
  playbooksMaybeSingle.mockResolvedValue({ data: BOOK, error: null });
  membersMaybeSingle.mockResolvedValue({ data: { user_id: "owner-1" }, error: null });
  profilesMaybeSingle.mockResolvedValue({ data: { display_name: "Coach Kerry" }, error: null });
  listPlaysMock.mockResolvedValue({
    ok: true,
    plays: [
      {
        id: "p1",
        name: "Mesh",
        wristband_code: null,
        shorthand: null,
        play_type: "offense",
        formation_name: null,
        tags: null,
        is_archived: false,
      },
    ],
  });
  playsIn.mockResolvedValue({ data: [{ id: "p1", current_version_id: "v1" }] });
  versionsIn.mockResolvedValue({ data: [{ id: "v1", document: { players: [] } }] });
});

describe("getPlaybookOfflineBundleAction", () => {
  it("never asks for the phantom `created_by` column", async () => {
    await getPlaybookOfflineBundleAction("pb-1");
    // The exact regression: one bad column 400s the whole query.
    expect(playbooksSelectArg).not.toContain("created_by");
  });

  it("a QUERY ERROR surfaces as an error — NOT as 'Playbook not found.'", async () => {
    playbooksMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "column playbooks.created_by does not exist" },
    });

    const res = await getPlaybookOfflineBundleAction("pb-1");

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    // The lie that cost a day of debugging. Must never come back.
    expect(res.error).not.toBe("Playbook not found.");
    expect(res.error).toContain("does not exist");
  });

  it("a genuinely absent playbook still reports 'Playbook not found.'", async () => {
    playbooksMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await getPlaybookOfflineBundleAction("pb-1");

    expect(res).toEqual({ ok: false, error: "Playbook not found." });
  });

  it("resolves ownerLabel via playbook_members(role=owner) → profiles", async () => {
    const res = await getPlaybookOfflineBundleAction("pb-1");

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.bundle.meta.ownerLabel).toBe("Coach Kerry");
    expect(res.bundle.meta.name).toBe("7v7 Example");
    expect(res.bundle.plays).toHaveLength(1);
    expect(res.bundle.documents).toEqual([
      { playId: "p1", playbookId: "pb-1", document: { players: [] } },
    ]);
  });

  it("survives a playbook with no owner row (ownerLabel just null)", async () => {
    membersMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await getPlaybookOfflineBundleAction("pb-1");

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.bundle.meta.ownerLabel).toBeNull();
  });
});
