/**
 * seedTeamPlaybookAction — league isolation guard.
 *
 * A league-seeded playbook must never land in the operator's OWN coach
 * dashboard/quota. The coach dashboard lists playbooks via `playbook_members`
 * membership (getDashboardSummaryAction), and this action deliberately never
 * inserts a `playbook_members` row for the seeding operator — see the
 * "All data access runs via the service role" comment at the top of
 * league-playbooks.ts. This test pins that by-omission: it runs the full
 * happy path to completion and asserts `playbook_members` was never touched.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const canMock = vi.fn();
const copyPlaybookContentsMock = vi.fn();
const touchedTables: string[] = [];

function makeQuery(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.insert = () => builder;
  builder.maybeSingle = () => promise;
  builder.single = () => promise;
  builder.then = promise.then.bind(promise);
  return builder;
}

let playbooksCallCount = 0;

const adminMock = {
  from: vi.fn((table: string) => {
    touchedTables.push(table);
    if (table === "leagues") return makeQuery({ data: { sport: "football" }, error: null });
    if (table === "teams") {
      return makeQuery({ data: { id: "team-1", name: "Wolves" }, error: null });
    }
    if (table === "playbooks") {
      playbooksCallCount += 1;
      if (playbooksCallCount === 1) return makeQuery({ data: null, error: null }); // no existing playbook
      if (playbooksCallCount === 2) {
        return makeQuery({ data: { id: "example-1" }, error: null }); // starter example
      }
      return makeQuery({ data: { id: "new-playbook-1" }, error: null }); // insert result
    }
    // Any other table — including playbook_members, if this ever regresses.
    return makeQuery({ data: null, error: null });
  }),
};

const supabaseMock = { auth: { getUser: vi.fn() } };

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(() => supabaseMock) }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn(() => adminMock) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/league/authorize", () => ({ can: (...args: unknown[]) => canMock(...args) }));
vi.mock("@/lib/data/playbook-copy", () => ({
  copyPlaybookContents: (...args: unknown[]) => copyPlaybookContentsMock(...args),
}));
vi.mock("@/lib/notifications/coach-playbook-email", () => ({
  sendCoachPlaybookInvite: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { seedTeamPlaybookAction } from "./league-playbooks";

beforeEach(() => {
  touchedTables.length = 0;
  playbooksCallCount = 0;
  adminMock.from.mockClear();
  canMock.mockReset();
  copyPlaybookContentsMock.mockReset();
  canMock.mockResolvedValue(true);
  copyPlaybookContentsMock.mockResolvedValue(undefined);
  supabaseMock.auth.getUser.mockReset();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: "operator-1" } } });
});

describe("seedTeamPlaybookAction — league isolation", () => {
  it("seeds a playbook end-to-end without ever inserting a playbook_members row", async () => {
    const res = await seedTeamPlaybookAction("league-1", "team-1", "flag_7v7");
    expect(res.ok).toBe(true);

    // Sanity: it actually ran the full path (existing check, example lookup,
    // insert), not an early return that trivially never touched anything.
    expect(touchedTables.filter((t) => t === "playbooks").length).toBeGreaterThanOrEqual(3);
    expect(touchedTables).not.toContain("playbook_members");
  });
});
