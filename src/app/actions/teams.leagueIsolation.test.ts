/**
 * listTeamsAction — league isolation guard.
 *
 * The coach product's team list and the league operator's teams share one
 * `teams` table (league teams carry a non-null `league_id`). This pins the
 * `.is("league_id", null)` filter (teams.ts) that keeps a league-created team
 * from ever appearing in a coach's own team list. If a future refactor drops
 * that filter, this test fails instead of the leak shipping silently.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const calls: { table: string; method: string; args: unknown[] }[] = [];

function recordingBuilder(table: string, result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
  }
  builder.then = promise.then.bind(promise);
  return builder;
}

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn((table: string) => {
    if (table === "organizations") {
      return recordingBuilder(table, { data: [{ id: "org-1" }], error: null });
    }
    return recordingBuilder(table, { data: [], error: null });
  }),
};

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(() => supabaseMock) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/data/workspace", () => ({ ensureDefaultWorkspace: vi.fn() }));

import { listTeamsAction } from "./teams";

beforeEach(() => {
  calls.length = 0;
  supabaseMock.from.mockClear();
  supabaseMock.auth.getUser.mockReset();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("listTeamsAction — league isolation", () => {
  it("scopes the teams query to this org AND league_id IS NULL", async () => {
    const res = await listTeamsAction();
    expect(res.ok).toBe(true);

    const teamsCalls = calls.filter((c) => c.table === "teams");
    const excludesLeagueTeams = teamsCalls.find((c) => c.method === "is");
    expect(excludesLeagueTeams).toBeDefined();
    expect(excludesLeagueTeams?.args).toEqual(["league_id", null]);

    const scopedToOrg = teamsCalls.find((c) => c.method === "eq" && c.args[0] === "org_id");
    expect(scopedToOrg?.args).toEqual(["org_id", "org-1"]);
  });
});
