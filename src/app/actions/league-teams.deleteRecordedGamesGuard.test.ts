/**
 * deleteLeagueTeamAction — recorded-games delete guard.
 *
 * REGRESSION: league_games.home_team_id/away_team_id were ON DELETE CASCADE
 * (20260621210000), and this action deleted the team row with no guard — so
 * deleting a team that had played silently deleted every game it appeared in.
 * Standings are DERIVED from final games, so that also erased the OPPONENT's
 * results and corrupted the league's standings with no warning. The FK is now
 * ON DELETE RESTRICT (20260701140000) and the action pre-checks the game
 * count, returning a friendly "delete its games/scores first" error instead
 * of deleting (or surfacing a raw FK violation). This test keeps that guard
 * from silently regressing.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const gateMock = vi.fn();
const gamesCountMock = vi.fn();
type DeleteResult = { error: { code?: string; message: string } | null };
const teamsDeleteResultMock = vi.fn<() => Promise<DeleteResult>>();
const teamsDeleteMock = vi.fn(() => ({
  eq: () => ({ eq: () => teamsDeleteResultMock() }),
}));

const supabaseMock = {
  from: (table: string) => {
    if (table === "league_games") {
      // .select("id", { count: "exact", head: true }).or(...)
      return { select: () => ({ or: () => gamesCountMock() }) };
    }
    // teams
    return { delete: () => teamsDeleteMock() };
  },
};

vi.mock("@/lib/league/authorize", () => ({
  gateLeagueCapability: (...args: unknown[]) => gateMock(...args),
  resolveLeagueView: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/data/workspace", () => ({ ensureDefaultWorkspace: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteLeagueTeamAction } from "./league-teams";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  gateMock.mockReset();
  gamesCountMock.mockReset();
  teamsDeleteResultMock.mockReset();
  teamsDeleteMock.mockClear();
  gateMock.mockResolvedValue({
    ok: true,
    supabase: supabaseMock,
    userId: "user-1",
    viaGrant: false,
  });
  teamsDeleteResultMock.mockResolvedValue({ error: null });
});

describe("deleteLeagueTeamAction — recorded-games guard", () => {
  it("blocks deleting a team that has recorded games and does NOT delete", async () => {
    gamesCountMock.mockResolvedValue({ count: 3, error: null });
    const res = await deleteLeagueTeamAction(LEAGUE_ID, TEAM_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/3 recorded games/i);
      expect(res.error).toMatch(/delete its games\/scores first/i);
    }
    expect(teamsDeleteMock).not.toHaveBeenCalled();
  });

  it("uses singular phrasing for exactly one game", async () => {
    gamesCountMock.mockResolvedValue({ count: 1, error: null });
    const res = await deleteLeagueTeamAction(LEAGUE_ID, TEAM_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/1 recorded game\./i);
    expect(teamsDeleteMock).not.toHaveBeenCalled();
  });

  it("deletes a team that has no recorded games", async () => {
    gamesCountMock.mockResolvedValue({ count: 0, error: null });
    const res = await deleteLeagueTeamAction(LEAGUE_ID, TEAM_ID);
    expect(res.ok).toBe(true);
    expect(teamsDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("translates a racing FK violation (23503) into the friendly message", async () => {
    // No games at check time, but one is recorded before the delete lands.
    gamesCountMock.mockResolvedValue({ count: 0, error: null });
    teamsDeleteResultMock.mockResolvedValue({
      error: { code: "23503", message: "violates foreign key constraint" },
    });
    const res = await deleteLeagueTeamAction(LEAGUE_ID, TEAM_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/delete its games\/scores first/i);
  });

  it("surfaces a count-query failure instead of deleting", async () => {
    gamesCountMock.mockResolvedValue({
      count: null,
      error: { message: "permission denied" },
    });
    const res = await deleteLeagueTeamAction(LEAGUE_ID, TEAM_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission denied/i);
    expect(teamsDeleteMock).not.toHaveBeenCalled();
  });

  it("returns the gate error without querying games when not authorized", async () => {
    gateMock.mockResolvedValue({ ok: false, error: "You don't have permission to do that." });
    const res = await deleteLeagueTeamAction(LEAGUE_ID, TEAM_ID);
    expect(res.ok).toBe(false);
    expect(gamesCountMock).not.toHaveBeenCalled();
    expect(teamsDeleteMock).not.toHaveBeenCalled();
  });
});
