import { describe, expect, it } from "vitest";

import { defaultsForNewTeam, type LibraryDefault, type LibraryItem } from "./library";

function item(id: string, variant: string): LibraryItem {
  return {
    id,
    kind: "play_group",
    sourcePlaybookId: "pb",
    sourceGroupId: "g",
    sourcePracticePlanId: null,
    title: id,
    sport: "football",
    variant,
    tags: [],
    createdAt: "2026-07-03T00:00:00Z",
  };
}
const d = (id: string, itemId: string, leagueId: string | null): LibraryDefault => ({
  id,
  itemId,
  leagueId,
});

const ITEMS = [item("a", "flag_7v7"), item("b", "flag_7v7"), item("c", "tackle_11")];

describe("defaultsForNewTeam", () => {
  it("applies org-wide defaults matching the team's variant", () => {
    const out = defaultsForNewTeam(ITEMS, [d("1", "a", null), d("2", "c", null)], "L1", "flag_7v7");
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });

  it("applies league-scoped defaults only to that league", () => {
    const defs = [d("1", "a", "L1"), d("2", "b", "L2")];
    expect(defaultsForNewTeam(ITEMS, defs, "L1", "flag_7v7").map((i) => i.id)).toEqual(["a"]);
    expect(defaultsForNewTeam(ITEMS, defs, "L2", "flag_7v7").map((i) => i.id)).toEqual(["b"]);
  });

  it("never applies an item whose variant differs from the team's", () => {
    expect(defaultsForNewTeam(ITEMS, [d("1", "c", null)], "L1", "flag_7v7")).toEqual([]);
  });

  it("de-dupes an item defaulted both org-wide and per-league", () => {
    const out = defaultsForNewTeam(ITEMS, [d("1", "a", null), d("2", "a", "L1")], "L1", "flag_7v7");
    expect(out).toHaveLength(1);
  });

  it("ignores defaults pointing at deleted items", () => {
    expect(defaultsForNewTeam(ITEMS, [d("1", "gone", null)], "L1", "flag_7v7")).toEqual([]);
  });
});
