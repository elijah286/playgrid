import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase server client + env check so these stay pure-unit (the repo
// has no live-DB test harness — see docs/league-platform/WAVE-0.md). The fake
// `from()` returns table-specific rows so we can drive both the organizer gate
// (league_organizers) and membership lookups (league_members).
const getUser = vi.fn();
let orgRows: Array<{ user_id: string }> = [];
let memberRows: Array<{ league_id: string; role: string }> = [];

const from = vi.fn((table: string) => ({
  select: () => ({
    eq: () =>
      Promise.resolve({ data: table === "league_organizers" ? orgRows : memberRows }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));

import {
  getCurrentLeagueMemberships,
  hasLeagueAccess,
  isLeagueAdmin,
  isLeagueAdminRole,
  isLeagueOrganizer,
  leagueOpsEnabled,
} from "./access";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.LEAGUE_OPS_ENABLED;
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  orgRows = [{ user_id: "u1" }];
  memberRows = [{ league_id: "L1", role: "operator" }];
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

describe("isLeagueOrganizer — the Layer-1 gate", () => {
  it("is TRUE when the user has a league_organizers row", async () => {
    expect(await isLeagueOrganizer()).toBe(true);
    expect(from).toHaveBeenCalledWith("league_organizers");
  });
  it("is FALSE for a non-organizer (every current user)", async () => {
    orgRows = [];
    expect(await isLeagueOrganizer()).toBe(false);
  });
  it("is FALSE when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await isLeagueOrganizer()).toBe(false);
  });
  it("is FALSE when the kill switch is off, without touching Supabase", async () => {
    process.env.LEAGUE_OPS_ENABLED = "off";
    expect(await isLeagueOrganizer()).toBe(false);
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("hasLeagueAccess — surface gate is organizer-only", () => {
  it("mirrors isLeagueOrganizer (true for an organizer)", async () => {
    expect(await hasLeagueAccess()).toBe(true);
  });
  it("is FALSE for a league member who is NOT an organizer", async () => {
    orgRows = []; // not an organizer
    memberRows = [{ league_id: "L1", role: "coach" }]; // but a member
    expect(await hasLeagueAccess()).toBe(false);
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
  it("returns [] when the kill switch is off", async () => {
    process.env.LEAGUE_OPS_ENABLED = "off";
    expect(await getCurrentLeagueMemberships()).toEqual([]);
  });
  it("maps membership rows for a member", async () => {
    expect(await getCurrentLeagueMemberships()).toEqual([
      { leagueId: "L1", role: "operator" },
    ]);
  });
});

describe("isLeagueAdmin — per-league", () => {
  it("true only for the league the user administers", async () => {
    memberRows = [{ league_id: "L1", role: "operator" }];
    expect(await isLeagueAdmin("L1")).toBe(true);
    expect(await isLeagueAdmin("L2")).toBe(false);
  });
  it("false when the user is only a participant", async () => {
    memberRows = [{ league_id: "L1", role: "coach" }];
    expect(await isLeagueAdmin("L1")).toBe(false);
  });
});
