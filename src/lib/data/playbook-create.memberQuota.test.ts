/**
 * createPlaybookForUser — member-not-owner quota pin (library plan, Phase 0).
 *
 * The league library & distribution model (docs/league-platform/
 * LIBRARY-DISTRIBUTION-PLAN.md) rests on this property: a coach invited onto
 * an org-owned league team playbook is a MEMBER (role editor/viewer), never
 * an owner — so their free-tier one-playbook allowance stays untouched and
 * "the coach still gets their own free playbook" needs no special-casing.
 *
 * That only holds while the free-quota query counts role="owner" rows
 * exclusively. If someone relaxes it to count all memberships, a league
 * coach's free slot silently disappears the moment they accept a team
 * invite. This test pins the filter and both quota outcomes.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const getUserEntitlementMock = vi.fn();
vi.mock("@/lib/billing/entitlement", () => ({
  getUserEntitlement: (...args: unknown[]) => getUserEntitlementMock(...args),
}));
vi.mock("@/lib/data/workspace", () => ({
  ensureDefaultWorkspace: vi.fn().mockResolvedValue({ teamId: "team-1" }),
}));

import { createPlaybookForUser } from "./playbook-create";

type Filter = { table: string; method: string; args: unknown[] };

function makeSupabase(ownedCount: number) {
  const filters: Filter[] = [];

  function builderFor(table: string) {
    const result =
      table === "playbook_members"
        ? { count: ownedCount, data: null, error: null }
        : { count: null, data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "insert", "update"]) {
      b[m] = (...args: unknown[]) => {
        filters.push({ table, method: m, args });
        return b;
      };
    }
    b.single = () => Promise.resolve({ data: { id: "pb-new" }, error: null });
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return b;
  }

  return {
    filters,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "coach-1" } } }),
      },
      from: (table: string) => builderFor(table),
    },
  };
}

const quotaFilters = (filters: Filter[]) =>
  filters.filter((f) => f.table === "playbook_members" && f.method === "eq");

beforeEach(() => {
  getUserEntitlementMock.mockReset();
  getUserEntitlementMock.mockResolvedValue({ tier: "free" });
});

describe("createPlaybookForUser — free-quota counts OWNED playbooks only", () => {
  it("filters the quota count to role=owner (memberships never count)", async () => {
    const { client, filters } = makeSupabase(0);
    await createPlaybookForUser(client as never, { name: "My Book" });

    const roleFilter = quotaFilters(filters).find((f) => f.args[0] === "role");
    expect(roleFilter).toBeDefined();
    expect(roleFilter?.args).toEqual(["role", "owner"]);
  });

  it("allows a free coach who owns 0 playbooks (regardless of memberships)", async () => {
    const { client } = makeSupabase(0);
    const res = await createPlaybookForUser(client as never, { name: "My Book" });
    expect(res.ok).toBe(true);
  });

  it("blocks a free coach at the owned-playbook cap", async () => {
    const { client } = makeSupabase(1);
    const res = await createPlaybookForUser(client as never, { name: "Second Book" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/free tier is limited/i);
  });

  it("skips the quota query entirely for a Coach+ user", async () => {
    getUserEntitlementMock.mockResolvedValue({ tier: "coach" });
    const { client, filters } = makeSupabase(99);
    const res = await createPlaybookForUser(client as never, { name: "Another" });
    expect(res.ok).toBe(true);
    // No role=owner quota filter ran — the only playbook_members touch is the
    // owner-membership INSERT for the newly created playbook.
    expect(quotaFilters(filters).find((f) => f.args[0] === "role")).toBeUndefined();
  });
});
