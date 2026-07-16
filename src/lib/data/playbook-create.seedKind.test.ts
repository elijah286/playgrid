/**
 * createPlaybookForUser — only OFFENSE seeds get snapshot-cloned.
 *
 * Defense seeds are STARTERS: surfaced read-only in the new-play picker and
 * cloned into a playbook lazily, on first use
 * (materializeStarterFormationAction). Nothing eager, nothing backfilled.
 *
 * The seed query originally filtered on `is_seed` alone. That was harmless
 * only because prod had zero defense seeds — the moment
 * 20260716090000_regen_defense_formation_seeds.sql landed, every new playbook
 * would have eagerly cloned 5-12 defensive formations the coach never made.
 * Worse, the clone rewrites semantic_key to `seeded_*`, which severs the
 * catalog link `defenseStarterZones` resolves through: the copy would produce
 * bare triangles while the identically-named starter tile produced a drawn-up
 * coverage, and materializeStarterFormationAction's semantic_key dedupe would
 * miss it and insert a duplicate.
 *
 * This pins the filter. Deleting it re-arms all three bugs at once.
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

/** Both seeds match the playbook's variant, so only the `kind` filter can
 *  keep the defensive one out. */
const SEED_ROWS = [
  {
    kind: "offense",
    semantic_key: "catalog_spread_flag_7v7_balanced",
    params: { displayName: "Spread", players: [{ id: "p_qb" }], sportProfile: { variant: "flag_7v7" } },
  },
  {
    kind: "defense",
    semantic_key: "catalog_def_7v7_zone_cover_2_flag_7v7_balanced",
    params: { displayName: "Cover 2", players: [{ id: "def_cb" }], sportProfile: { variant: "flag_7v7" } },
  },
];

function makeSupabase() {
  const filters: Filter[] = [];
  const inserted: Record<string, unknown>[] = [];

  function builderFor(table: string) {
    const state: { kind?: string } = {};
    const b: Record<string, unknown> = {};
    for (const m of ["select", "in", "order", "limit", "update"]) {
      b[m] = (...args: unknown[]) => {
        filters.push({ table, method: m, args });
        return b;
      };
    }
    b.eq = (...args: unknown[]) => {
      filters.push({ table, method: "eq", args });
      if (table === "formations" && args[0] === "kind") state.kind = args[1] as string;
      return b;
    };
    b.insert = (rows: unknown) => {
      filters.push({ table, method: "insert", args: [rows] });
      if (table === "formations" && Array.isArray(rows)) inserted.push(...(rows as Record<string, unknown>[]));
      return b;
    };
    b.single = () => Promise.resolve({ data: { id: "pb-new" }, error: null });
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (resolve: (v: unknown) => unknown) => {
      // Honour the kind filter the way PostgREST would, so the assertion
      // measures the query and not the mock.
      const rows =
        table === "formations"
          ? SEED_ROWS.filter((s) => (state.kind ? s.kind === state.kind : true))
          : [];
      const result =
        table === "playbook_members"
          ? { count: 0, data: null, error: null }
          : { count: null, data: rows, error: null };
      return Promise.resolve(result).then(resolve);
    };
    return b;
  }

  return {
    filters,
    inserted,
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "coach-1" } } }) },
      from: (table: string) => builderFor(table),
    },
  };
}

beforeEach(() => {
  getUserEntitlementMock.mockReset();
  getUserEntitlementMock.mockResolvedValue({ tier: "coach" });
});

describe("createPlaybookForUser — seed cloning is offense-only", () => {
  it("filters the seed query to kind=offense", async () => {
    const { client, filters } = makeSupabase();
    await createPlaybookForUser(client as never, { name: "Book", sportVariant: "flag_7v7" });

    const kindFilter = filters.find(
      (f) => f.table === "formations" && f.method === "eq" && f.args[0] === "kind",
    );
    expect(kindFilter).toBeDefined();
    expect(kindFilter?.args).toEqual(["kind", "offense"]);
  });

  it("never clones a defense seed into a new playbook", async () => {
    const { client, inserted } = makeSupabase();
    await createPlaybookForUser(client as never, { name: "Book", sportVariant: "flag_7v7" });

    expect(inserted.length).toBeGreaterThan(0); // offense seeds still clone
    expect(inserted.every((r) => r.kind === "offense")).toBe(true);
    expect(inserted.some((r) => r.kind === "defense")).toBe(false);
  });

  it("still clones the offense seed — the filter must not break existing behavior", async () => {
    const { client, inserted } = makeSupabase();
    await createPlaybookForUser(client as never, { name: "Book", sportVariant: "flag_7v7" });

    expect(inserted).toHaveLength(1);
    expect((inserted[0].params as { displayName: string }).displayName).toBe("Spread");
  });
});
