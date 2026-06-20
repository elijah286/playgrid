import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase server client + env check so these stay pure-unit (the repo
// has no live-DB test harness — see docs/league-platform/WAVE-0.md).
const getUser = vi.fn();
const eq = vi.fn();
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));

import {
  getCurrentLeagueMemberships,
  hasLeagueAccess,
  isLeagueAdmin,
  isLeagueAdminRole,
  leagueOpsEnabled,
} from "./access";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.LEAGUE_OPS_ENABLED;
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  eq.mockResolvedValue({ data: [{ league_id: "L1", role: "operator" }] });
});

describe("leagueOpsEnabled — kill switch", () => {
  it("defaults ON", () => {
    expect(leagueOpsEnabled()).toBe(true);
  });
  it("is OFF when LEAGUE_OPS_ENABLED=off", () => {
    process.env.LEAGUE_OPS_ENABLED = "off";
    expect(leagueOpsEnabled()).toBe(false);
  });
});

describe("isLeagueAdminRole", () => {
  it("operator and league_admin administer", () => {
    expect(isLeagueAdminRole("operator")).toBe(true);
    expect(isLeagueAdminRole("league_admin")).toBe(true);
  });
  it("participant roles do not", () => {
    for (const r of ["coach", "parent", "player", "volunteer"] as const) {
      expect(isLeagueAdminRole(r)).toBe(false);
    }
  });
});

describe("getCurrentLeagueMemberships", () => {
  it("returns [] when the kill switch is off, without touching Supabase", async () => {
    process.env.LEAGUE_OPS_ENABLED = "off";
    expect(await getCurrentLeagueMemberships()).toEqual([]);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns [] when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getCurrentLeagueMemberships()).toEqual([]);
  });

  it("maps membership rows for a member", async () => {
    expect(await getCurrentLeagueMemberships()).toEqual([
      { leagueId: "L1", role: "operator" },
    ]);
    expect(from).toHaveBeenCalledWith("league_members");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });
});

describe("hasLeagueAccess — the surface gate", () => {
  it("is FALSE for a non-member (every existing user)", async () => {
    eq.mockResolvedValue({ data: [] });
    expect(await hasLeagueAccess()).toBe(false);
  });

  it("is TRUE for a league member", async () => {
    expect(await hasLeagueAccess()).toBe(true);
  });

  it("is FALSE when the kill switch is off, even for a member", async () => {
    process.env.LEAGUE_OPS_ENABLED = "off";
    expect(await hasLeagueAccess()).toBe(false);
  });
});

describe("isLeagueAdmin — per-league", () => {
  it("true only for the league the user administers", async () => {
    eq.mockResolvedValue({ data: [{ league_id: "L1", role: "operator" }] });
    expect(await isLeagueAdmin("L1")).toBe(true);
    expect(await isLeagueAdmin("L2")).toBe(false);
  });

  it("false when the user is only a participant", async () => {
    eq.mockResolvedValue({ data: [{ league_id: "L1", role: "coach" }] });
    expect(await isLeagueAdmin("L1")).toBe(false);
  });
});
