/**
 * Owner resolution + feature blend (library plan, Phase 3).
 *
 * 1. getPlaybookOwnerId falls back to the league operator for org-owned
 *    league team playbooks (which have no owner-member row by design) —
 *    the single fix every owner-keyed gate (play cap, seats, blend)
 *    inherits.
 * 2. getPlaybookFeatureEntitlement returns the BETTER of viewer/owner —
 *    a free league coach gets the operator's features on the team playbook,
 *    a paying viewer never gets downgraded by a free owner.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const getCurrentEntitlementMock = vi.fn();
const getUserEntitlementMock = vi.fn();
vi.mock("./entitlement", () => ({
  getCurrentEntitlement: (...a: unknown[]) => getCurrentEntitlementMock(...a),
  getUserEntitlement: (...a: unknown[]) => getUserEntitlementMock(...a),
}));

let ownerMemberRow: { user_id: string } | null = null;
let playbookRow: Record<string, unknown> | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({ data: table === "playbook_members" ? ownerMemberRow : playbookRow });
      return chain;
    },
  }),
}));

import {
  getPlaybookFeatureEntitlement,
  getPlaybookOwnerId,
} from "./owner-entitlement";

beforeEach(() => {
  ownerMemberRow = null;
  playbookRow = null;
  getCurrentEntitlementMock.mockReset();
  getUserEntitlementMock.mockReset();
});

describe("getPlaybookOwnerId — league fallback", () => {
  it("prefers the owner-member row when present (unchanged behavior)", async () => {
    ownerMemberRow = { user_id: "coach-owner" };
    expect(await getPlaybookOwnerId("pb-1")).toBe("coach-owner");
  });

  it("falls back to the league operator for org-owned league playbooks", async () => {
    playbookRow = {
      team_id: "team-1",
      teams: { league_id: "league-1", leagues: { created_by: "operator-1" } },
    };
    expect(await getPlaybookOwnerId("pb-league")).toBe("operator-1");
  });

  it("returns null for a non-league playbook with no owner member", async () => {
    playbookRow = { team_id: "team-1", teams: { league_id: null, leagues: null } };
    expect(await getPlaybookOwnerId("pb-orphan")).toBeNull();
  });
});

describe("getPlaybookFeatureEntitlement — viewer/owner blend", () => {
  it("a free viewer inherits a paying owner's tier on that playbook", async () => {
    ownerMemberRow = { user_id: "paying-owner" };
    getCurrentEntitlementMock.mockResolvedValue({ tier: "free" });
    getUserEntitlementMock.mockResolvedValue({ tier: "coach" });
    const ent = await getPlaybookFeatureEntitlement("pb-1");
    expect(ent?.tier).toBe("coach");
  });

  it("a paying viewer keeps their own tier on a free owner's playbook", async () => {
    ownerMemberRow = { user_id: "free-owner" };
    getCurrentEntitlementMock.mockResolvedValue({ tier: "coach" });
    getUserEntitlementMock.mockResolvedValue({ tier: "free" });
    const ent = await getPlaybookFeatureEntitlement("pb-1");
    expect(ent?.tier).toBe("coach");
  });

  it("league playbook: free coach inherits the operator's tier via the fallback", async () => {
    playbookRow = {
      team_id: "team-1",
      teams: { league_id: "league-1", leagues: { created_by: "operator-1" } },
    };
    getCurrentEntitlementMock.mockResolvedValue({ tier: "free" });
    getUserEntitlementMock.mockResolvedValue({ tier: "coach" });
    const ent = await getPlaybookFeatureEntitlement("pb-league");
    expect(getUserEntitlementMock).toHaveBeenCalledWith("operator-1");
    expect(ent?.tier).toBe("coach");
  });

  it("falls back to the viewer when no owner resolves", async () => {
    getCurrentEntitlementMock.mockResolvedValue({ tier: "free" });
    const ent = await getPlaybookFeatureEntitlement("pb-orphan");
    expect(ent?.tier).toBe("free");
    expect(getUserEntitlementMock).not.toHaveBeenCalled();
  });
});
