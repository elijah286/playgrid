/**
 * Creating a formation asks which side it's for, and the roster follows.
 *
 * Before this, the editor inferred the side from the Formations tab's filter
 * and there was no way to change it once open — and it always drew the
 * offensive roster, so a "defensive formation" arrived as a QB and receivers.
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
    // Backstop, not a fallback: kindOptionsForVariant already withholds the
    // option, and the editor resets to offense if the variant changes under it.
    expect(defaultSpecialTeamsPlayers("flag_5v5")).toEqual([]);
    expect(kindOptionsForVariant("flag_5v5").some((o) => o.value === "special_teams")).toBe(false);
  });
});
