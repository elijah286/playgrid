/**
 * Creating a formation asks which side it's for, and the roster follows.
 *
 * The side is picked BEFORE the editor opens and is fixed from then on —
 * converting a saved formation between sides would mean converting its
 * players, mirroring the layout across the LOS, and pushing the result into
 * every play already linked to it.
 *
 * These pin the two halves the coach actually sees: which sides are offered
 * for a variant, and that each side brings its own players and glyph.
 */
import { describe, expect, it } from "vitest";
import { kindOptionsForVariant } from "./FormationEditorClient";
import {
  defaultDefendersForVariant,
  defaultPlayersForVariant,
  defaultSpecialTeamsPlayers,
} from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

const rosterFor = (kind: string, v: SportVariant) =>
  kind === "defense"
    ? defaultDefendersForVariant(v)
    : kind === "special_teams"
      ? defaultSpecialTeamsPlayers(v)
      : defaultPlayersForVariant(v);

describe("kindOptionsForVariant", () => {
  it.each(["flag_5v5", "flag_6v6", "flag_7v7"] as const)(
    "%s offers Offense and Defense only — special teams is tackle-only",
    (v) => {
      expect(kindOptionsForVariant(v).map((o) => o.value)).toEqual(["offense", "defense"]);
    },
  );

  it("tackle_11 also offers Special teams", () => {
    expect(kindOptionsForVariant("tackle_11").map((o) => o.value)).toEqual([
      "offense",
      "defense",
      "special_teams",
    ]);
  });

  it("never offers a side whose roster we can't build", () => {
    for (const v of ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"] as const) {
      for (const opt of kindOptionsForVariant(v)) {
        expect(rosterFor(opt.value, v).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the roster adapts to the side", () => {
  it("defense draws triangles, offense draws circles", () => {
    const def = defaultDefendersForVariant("flag_5v5");
    const off = defaultPlayersForVariant("flag_5v5");
    expect(def.every((p) => p.shape === "triangle")).toBe(true);
    expect(off.every((p) => p.shape !== "triangle")).toBe(true);
  });

  it("special teams draws squares", () => {
    const st = defaultSpecialTeamsPlayers("tackle_11");
    expect(st.length).toBe(11);
    expect(st.every((p) => p.shape === "square")).toBe(true);
  });

  it("each side is a genuinely different roster, not a relabelled one", () => {
    const ids = (ps: { id: string }[]) => ps.map((p) => p.id).join(",");
    expect(ids(defaultDefendersForVariant("tackle_11"))).not.toBe(
      ids(defaultPlayersForVariant("tackle_11")),
    );
    expect(ids(defaultSpecialTeamsPlayers("tackle_11"))).not.toBe(
      ids(defaultPlayersForVariant("tackle_11")),
    );
  });

  it("special teams yields nothing outside tackle — the option is never offered there", () => {
    // Backstop, not a fallback. Three gates keep it unreachable: the New
    // formation picker withholds the option outside tackle, the page rewrites
    // a hand-typed ?kind=special_teams to offense, and the editor's Sport type
    // won't offer a non-tackle variant to a special-teams formation.
    expect(defaultSpecialTeamsPlayers("flag_5v5")).toEqual([]);
    expect(kindOptionsForVariant("flag_5v5").some((o) => o.value === "special_teams")).toBe(false);
  });
});

describe("sport type and side can't contradict each other", () => {
  // The editor has no Type control, so there is nothing to recover with if a
  // side and a variant disagree. Every offered pairing must be buildable.
  it.each(["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"] as const)(
    "%s — every offered side has a roster",
    (v) => {
      for (const opt of kindOptionsForVariant(v)) {
        expect(rosterFor(opt.value, v).length).toBeGreaterThan(0);
      }
    },
  );

  it("special teams is offered only where it can be built", () => {
    const offered = (v: SportVariant) =>
      kindOptionsForVariant(v).some((o) => o.value === "special_teams");
    const buildable = (v: SportVariant) => defaultSpecialTeamsPlayers(v).length > 0;
    for (const v of ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"] as const) {
      expect(offered(v)).toBe(buildable(v));
    }
  });
});
