/**
 * Filter / sort / group for the shell team plays view.
 *
 * Regression cover for the mobile reports: "offense should be the first group",
 * "sort and filter are missing", plus the added sort modes, group-by variants,
 * and Show archived.
 */
import { describe, expect, it } from "vitest";
import type { PlayType } from "@/domain/play/types";
import type { PlaybookDetailPlayRow } from "@/app/actions/plays";
import {
  filterPlays,
  groupPlays,
  presentPlayTypes,
  sortPlays,
} from "./team-plays-grouping";

function play(
  over: Partial<PlaybookDetailPlayRow> & { id: string; play_type: PlayType },
): PlaybookDetailPlayRow {
  return {
    name: over.id,
    wristband_code: null,
    shorthand: null,
    concept: null,
    formation_name: null,
    tags: [],
    group_id: null,
    sort_order: 0,
    updated_at: null,
    is_archived: false,
    special_teams_unit: null,
    shared_with_players: true,
    preview: null,
    hasNotes: false,
    ...over,
  };
}

describe("groupPlays — type (offense-first)", () => {
  it("orders offense first and special teams third, regardless of input order", () => {
    const sections = groupPlays(
      [
        play({ id: "st", play_type: "special_teams" }),
        play({ id: "def", play_type: "defense" }),
        play({ id: "off", play_type: "offense" }),
        play({ id: "drill", play_type: "practice_plan" }),
      ],
      "type",
    );
    expect(sections.map((s) => s.key)).toEqual([
      "offense",
      "defense",
      "special_teams",
      "practice_plan",
    ]);
    expect(sections[0].label).toBe("Offense");
  });

  it("preserves the incoming (already-sorted) order within a section", () => {
    const sections = groupPlays(
      [
        play({ id: "a", play_type: "offense" }),
        play({ id: "b", play_type: "offense" }),
        play({ id: "c", play_type: "offense" }),
      ],
      "type",
    );
    expect(sections[0].plays.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupPlays — formation / group / none", () => {
  it("groups by formation, A→Z, unassigned last", () => {
    const sections = groupPlays(
      [
        play({ id: "1", play_type: "offense", formation_name: "Trips" }),
        play({ id: "2", play_type: "offense", formation_name: null }),
        play({ id: "3", play_type: "offense", formation_name: "Ace" }),
      ],
      "formation",
    );
    expect(sections.map((s) => s.label)).toEqual(["Ace", "Trips", "Unassigned formation"]);
  });

  it("groups by custom group in group order, ungrouped last", () => {
    const groups = [
      { id: "g2", name: "Red Zone", sort_order: 2 },
      { id: "g1", name: "Base", sort_order: 1 },
    ];
    const sections = groupPlays(
      [
        play({ id: "1", play_type: "offense", group_id: "g2" }),
        play({ id: "2", play_type: "offense", group_id: null }),
        play({ id: "3", play_type: "offense", group_id: "g1" }),
      ],
      "group",
      groups,
    );
    expect(sections.map((s) => s.label)).toEqual(["Base", "Red Zone", "Ungrouped"]);
  });

  it("none → a single unlabeled section", () => {
    const sections = groupPlays(
      [play({ id: "1", play_type: "offense" }), play({ id: "2", play_type: "defense" })],
      "none",
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe("");
    expect(sections[0].plays.map((p) => p.id)).toEqual(["1", "2"]);
  });
});

describe("sortPlays", () => {
  const plays = [
    play({ id: "b", play_type: "offense", name: "Bravo", sort_order: 2, updated_at: "2026-01-01" }),
    play({ id: "a", play_type: "offense", name: "Alpha", sort_order: 3, updated_at: "2026-03-01" }),
    play({ id: "c", play_type: "offense", name: "Charlie", sort_order: 1, updated_at: "2026-02-01" }),
  ];
  it("manual = sort_order", () => {
    expect(sortPlays(plays, "manual").map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
  it("name = A→Z", () => {
    expect(sortPlays(plays, "name").map((p) => p.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
  it("recent = newest updated first", () => {
    expect(sortPlays(plays, "recent").map((p) => p.id)).toEqual(["a", "c", "b"]);
  });
});

describe("filterPlays", () => {
  const plays = [
    play({ id: "1", name: "Mesh", play_type: "offense", formation_name: "Trips", tags: ["quick"] }),
    play({ id: "2", name: "Cover 3", play_type: "defense", shorthand: "c3" }),
    play({ id: "3", name: "Punt", play_type: "special_teams", is_archived: true }),
  ];

  it("hides archived unless showArchived", () => {
    expect(filterPlays(plays, "", "all").map((p) => p.id)).toEqual(["1", "2"]);
    expect(filterPlays(plays, "", "all", true).map((p) => p.id)).toEqual(["1", "2", "3"]);
  });
  it("filters by play type", () => {
    expect(filterPlays(plays, "", "offense").map((p) => p.id)).toEqual(["1"]);
  });
  it("matches name/formation/shorthand/tags, case-insensitive", () => {
    expect(filterPlays(plays, "trips", "all").map((p) => p.id)).toEqual(["1"]);
    expect(filterPlays(plays, "C3", "all").map((p) => p.id)).toEqual(["2"]);
    expect(filterPlays(plays, "quick", "all").map((p) => p.id)).toEqual(["1"]);
  });
});

describe("presentPlayTypes", () => {
  it("returns distinct present types in offense-first order", () => {
    expect(
      presentPlayTypes([
        play({ id: "1", play_type: "special_teams" }),
        play({ id: "2", play_type: "offense" }),
        play({ id: "3", play_type: "offense" }),
      ]),
    ).toEqual(["offense", "special_teams"]);
  });
});
