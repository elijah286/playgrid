import { describe, expect, it } from "vitest";
import {
  DEFENSIVE_ALIGNMENTS,
  alignmentPlayersWithUniqueIds,
} from "./defensiveAlignments";
import {
  defenseStarterSemanticKey,
  isDefenseStarterKey,
  resolveDefenseStarter,
} from "./defenseStarters";

describe("alignmentPlayersWithUniqueIds", () => {
  it("suffixes duplicate catalog labels so every defender has a unique id", () => {
    // 5v5 Cover 2 authors two players both labelled "CB" — the catalog `id`
    // is a positional label, not a unique key.
    const a = DEFENSIVE_ALIGNMENTS.find(
      (x) => x.variant === "flag_5v5" && x.coverage === "Cover 2",
    )!;
    const players = alignmentPlayersWithUniqueIds(a, "right");
    const ids = players.map((p) => p.uniqueId);
    expect(ids).toContain("CB");
    expect(ids).toContain("CB2");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps `role` as the bare label so both triangles still display 'CB'", () => {
    const a = DEFENSIVE_ALIGNMENTS.find(
      (x) => x.variant === "flag_5v5" && x.coverage === "Cover 2",
    )!;
    const cbs = alignmentPlayersWithUniqueIds(a, "right").filter((p) => p.role === "CB");
    expect(cbs).toHaveLength(2);
    expect(cbs.map((p) => p.uniqueId)).toEqual(["CB", "CB2"]);
  });

  it.each(DEFENSIVE_ALIGNMENTS.map((a) => [`${a.variant} ${a.front}/${a.coverage}`, a] as const))(
    "%s — ids are unique for both strengths",
    (_label, alignment) => {
      for (const strength of ["left", "right"] as const) {
        const ids = alignmentPlayersWithUniqueIds(alignment, strength).map((p) => p.uniqueId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    },
  );
});

describe("defenseStarterSemanticKey / resolveDefenseStarter", () => {
  it.each(DEFENSIVE_ALIGNMENTS.map((a) => [`${a.variant} ${a.front}/${a.coverage}`, a] as const))(
    "%s — every alignment round-trips through its semantic key",
    (_label, alignment) => {
      for (const strength of ["balanced", "right", "left"] as const) {
        const key = defenseStarterSemanticKey(alignment, strength);
        const resolved = resolveDefenseStarter(key);
        expect(resolved).not.toBeNull();
        expect(resolved!.alignment.front).toBe(alignment.front);
        expect(resolved!.alignment.coverage).toBe(alignment.coverage);
        expect(resolved!.alignment.variant).toBe(alignment.variant);
        expect(resolved!.strength).toBe(strength);
      }
    },
  );

  it("produces a distinct key per alignment × strength (no collisions)", () => {
    const keys = DEFENSIVE_ALIGNMENTS.flatMap((a) =>
      (["balanced", "right", "left"] as const).map((s) => defenseStarterSemanticKey(a, s)),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns null for user-authored and offense keys — those have no zones to install", () => {
    expect(resolveDefenseStarter("custom_1739_abc")).toBeNull();
    expect(resolveDefenseStarter("seeded_1739_abc")).toBeNull();
    expect(resolveDefenseStarter("catalog_spread_flag_5v5_balanced")).toBeNull();
    expect(resolveDefenseStarter(null)).toBeNull();
    expect(resolveDefenseStarter(undefined)).toBeNull();
    expect(resolveDefenseStarter("")).toBeNull();
  });

  it("isDefenseStarterKey discriminates catalog defense seeds from everything else", () => {
    const a = DEFENSIVE_ALIGNMENTS[0];
    expect(isDefenseStarterKey(defenseStarterSemanticKey(a, "balanced"))).toBe(true);
    expect(isDefenseStarterKey("custom_1")).toBe(false);
  });

  it("keys are stable strings — a change here orphans every seeded row in prod", () => {
    // Guards the format itself: seed rows are matched by semantic_key across
    // migration regens (row uuids change), so silently reformatting the key
    // would strand every coach's linked defensive formation.
    const a = DEFENSIVE_ALIGNMENTS.find(
      (x) => x.variant === "flag_7v7" && x.coverage === "Cover 2",
    )!;
    expect(defenseStarterSemanticKey(a, "balanced")).toBe(
      "catalog_def_7v7_zone_cover_2_flag_7v7_balanced",
    );
  });
});
