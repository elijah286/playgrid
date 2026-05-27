/**
 * Regression: free-tier play cap counts soft-deleted plays.
 *
 * Surfaced 2026-05-18 — coach reported "free tier capped at 16 plays" pop-up
 * while only 11 plays were visible. Root cause: assertPlayCap omitted the
 * `deleted_at IS NULL` filter that listPlays already uses, so trashed plays
 * silently consumed cap budget. These tests pin the query shape so the filter
 * stays on.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const getPlaybookOwnerEntitlementMock = vi.fn<() => Promise<unknown>>();
const getPlaybookOwnerIdMock = vi.fn<() => Promise<string | null>>();
const tierAtLeastMock = vi.fn<(ent: unknown, tier: string) => boolean>();
const getFreePlayCapForOwnerMock = vi.fn<(ownerId: string | null) => Promise<number>>();

vi.mock("@/lib/billing/owner-entitlement", () => ({
  getPlaybookOwnerEntitlement: (id: string) => getPlaybookOwnerEntitlementMock(),
  getPlaybookOwnerId: (id: string) => getPlaybookOwnerIdMock(),
}));

vi.mock("@/lib/billing/features", () => ({
  tierAtLeast: (ent: unknown, tier: string) => tierAtLeastMock(ent, tier),
}));

vi.mock("@/lib/site/free-plays-config", () => ({
  getFreePlayCapForOwner: (ownerId: string | null) => getFreePlayCapForOwnerMock(ownerId),
}));

import { assertPlayCap } from "./play-cap";

type IsCall = { column: string; value: unknown };

function makeSupabase(opts: { count: number }) {
  const isCalls: IsCall[] = [];
  const eqCalls: IsCall[] = [];
  // Thenable that resolves to the count result so `await chain` returns it.
  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      eqCalls.push({ column: col, value: val });
      return builder;
    },
    is(col: string, val: unknown) {
      isCalls.push({ column: col, value: val });
      return builder;
    },
    then<T>(onFulfilled: (v: { count: number }) => T) {
      return Promise.resolve({ count: opts.count }).then(onFulfilled);
    },
  };
  const from = vi.fn(() => builder);

  return {
    isCalls,
    eqCalls,
    from,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: { from } as any,
  };
}

beforeEach(() => {
  getPlaybookOwnerEntitlementMock.mockReset();
  getPlaybookOwnerIdMock.mockReset();
  getPlaybookOwnerIdMock.mockResolvedValue("owner-1");
  tierAtLeastMock.mockReset();
  getFreePlayCapForOwnerMock.mockReset();
});

describe("assertPlayCap — query shape", () => {
  it("filters out soft-deleted plays (deleted_at IS NULL)", async () => {
    getPlaybookOwnerEntitlementMock.mockResolvedValue({ tier: "free" });
    tierAtLeastMock.mockReturnValue(false);
    getFreePlayCapForOwnerMock.mockResolvedValue(16);
    const sb = makeSupabase({ count: 0 });

    await assertPlayCap(sb.client, "pb-1");

    const filtered = sb.isCalls.map((c) => c.column);
    expect(filtered).toContain("deleted_at");
    expect(filtered).toContain("attached_to_play_id");
    const deletedAt = sb.isCalls.find((c) => c.column === "deleted_at");
    expect(deletedAt?.value).toBeNull();
  });

  it("scopes count to the requested playbook and excludes archived plays", async () => {
    getPlaybookOwnerEntitlementMock.mockResolvedValue({ tier: "free" });
    tierAtLeastMock.mockReturnValue(false);
    getFreePlayCapForOwnerMock.mockResolvedValue(16);
    const sb = makeSupabase({ count: 0 });

    await assertPlayCap(sb.client, "pb-42");

    expect(sb.eqCalls).toContainEqual({ column: "playbook_id", value: "pb-42" });
    expect(sb.eqCalls).toContainEqual({ column: "is_archived", value: false });
  });
});

describe("assertPlayCap — gating", () => {
  it("rejects when the visible count meets the limit", async () => {
    getPlaybookOwnerEntitlementMock.mockResolvedValue({ tier: "free" });
    tierAtLeastMock.mockReturnValue(false);
    getFreePlayCapForOwnerMock.mockResolvedValue(16);
    const sb = makeSupabase({ count: 16 });

    const result = await assertPlayCap(sb.client, "pb-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/capped at 16 plays/);
    }
  });

  it("allows the create when the visible count is below the limit", async () => {
    getPlaybookOwnerEntitlementMock.mockResolvedValue({ tier: "free" });
    tierAtLeastMock.mockReturnValue(false);
    getFreePlayCapForOwnerMock.mockResolvedValue(16);
    const sb = makeSupabase({ count: 11 });

    const result = await assertPlayCap(sb.client, "pb-1");

    expect(result.ok).toBe(true);
  });

  it("skips the count entirely for coach-tier owners", async () => {
    getPlaybookOwnerEntitlementMock.mockResolvedValue({ tier: "coach" });
    tierAtLeastMock.mockReturnValue(true);
    const sb = makeSupabase({ count: 9999 });

    const result = await assertPlayCap(sb.client, "pb-1");

    expect(result.ok).toBe(true);
    expect(sb.from).not.toHaveBeenCalled();
    expect(getFreePlayCapForOwnerMock).not.toHaveBeenCalled();
  });
});
