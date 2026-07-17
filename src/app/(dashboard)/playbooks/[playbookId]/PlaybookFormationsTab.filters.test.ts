/**
 * Formations tab — kind + search filtering.
 *
 * The Formations tab showed no indication of which side a formation was for,
 * and had no way to filter to one. These pin the filter half.
 *
 * The empty-search case is the one that matters: the search filter used to
 * short-circuit ("no needle → return everything"), so a kind check added only
 * to the trailing predicate would have done nothing whenever the search box
 * was empty — i.e. essentially always.
 */
import { describe, expect, it } from "vitest";
import { matchesFormationFilters } from "./PlaybookFormationsTab";

const off = { displayName: "Trips Right", kind: "offense" as const };
const def = { displayName: "Cover 2", kind: "defense" as const };
const st = { displayName: "Punt", kind: "special_teams" as const };

describe("matchesFormationFilters", () => {
  it("kind filter applies when the search box is EMPTY (the short-circuit trap)", () => {
    const f = { kindFilter: "defense" as const, search: "" };
    expect(matchesFormationFilters(def, f)).toBe(true);
    expect(matchesFormationFilters(off, f)).toBe(false);
    expect(matchesFormationFilters(st, f)).toBe(false);
  });

  it("'all' shows every side", () => {
    const f = { kindFilter: "all" as const, search: "" };
    expect([off, def, st].every((x) => matchesFormationFilters(x, f))).toBe(true);
  });

  it("combines kind and search — both must pass", () => {
    expect(
      matchesFormationFilters(def, { kindFilter: "defense", search: "cover" }),
    ).toBe(true);
    // right kind, wrong name
    expect(
      matchesFormationFilters(def, { kindFilter: "defense", search: "trips" }),
    ).toBe(false);
    // right name, wrong kind
    expect(
      matchesFormationFilters(off, { kindFilter: "defense", search: "trips" }),
    ).toBe(false);
  });

  it("search stays case- and whitespace-insensitive", () => {
    expect(matchesFormationFilters(def, { kindFilter: "all", search: "  COVER  " })).toBe(true);
    expect(matchesFormationFilters(def, { kindFilter: "all", search: "   " })).toBe(true);
  });

  it("filters special teams independently of defense", () => {
    expect(matchesFormationFilters(st, { kindFilter: "special_teams", search: "" })).toBe(true);
    expect(matchesFormationFilters(def, { kindFilter: "special_teams", search: "" })).toBe(false);
  });
});
