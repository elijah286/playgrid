/**
 * Offense-first grouping + search/filter for the shell team plays view.
 *
 * Regression cover for the mobile report: "offense should be the first group
 * but it's starting with special teams", and "sort and filter are missing".
 */
import { describe, expect, it } from "vitest";
import type { PlayType } from "@/domain/play/types";
import type { PlaybookDetailPlayRow } from "@/app/actions/plays";
import {
  filterPlays,
  groupPlaysOffenseFirst,
  presentPlayTypes,
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

describe("groupPlaysOffenseFirst", () => {
  it("orders offense first and special teams third, regardless of input order", () => {
    const sections = groupPlaysOffenseFirst([
      play({ id: "st", play_type: "special_teams" }),
      play({ id: "def", play_type: "defense" }),
      play({ id: "off", play_type: "offense" }),
      play({ id: "drill", play_type: "practice_plan" }),
    ]);
    expect(sections.map((s) => s.type)).toEqual([
      "offense",
      "defense",
      "special_teams",
      "practice_plan",
    ]);
    expect(sections[0].label).toBe("Offense");
  });

  it("keeps the coach's sort_order within a section", () => {
    const sections = groupPlaysOffenseFirst([
      play({ id: "b", play_type: "offense", sort_order: 2 }),
      play({ id: "a", play_type: "offense", sort_order: 1 }),
      play({ id: "c", play_type: "offense", sort_order: 3 }),
    ]);
    expect(sections[0].plays.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("omits sections with no plays", () => {
    const sections = groupPlaysOffenseFirst([play({ id: "off", play_type: "offense" })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("offense");
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

describe("filterPlays", () => {
  const plays = [
    play({ id: "1", name: "Mesh", play_type: "offense", formation_name: "Trips", tags: ["quick"] }),
    play({ id: "2", name: "Cover 3", play_type: "defense", shorthand: "c3" }),
    play({ id: "3", name: "Punt", play_type: "special_teams" }),
  ];

  it("filters by play type", () => {
    expect(filterPlays(plays, "", "offense").map((p) => p.id)).toEqual(["1"]);
  });

  it("matches name, formation, shorthand and tags (case-insensitive)", () => {
    expect(filterPlays(plays, "trips", "all").map((p) => p.id)).toEqual(["1"]);
    expect(filterPlays(plays, "quick", "all").map((p) => p.id)).toEqual(["1"]);
    expect(filterPlays(plays, "C3", "all").map((p) => p.id)).toEqual(["2"]);
    expect(filterPlays(plays, "punt", "all").map((p) => p.id)).toEqual(["3"]);
  });

  it("combines type filter and search", () => {
    expect(filterPlays(plays, "cover", "defense").map((p) => p.id)).toEqual(["2"]);
    expect(filterPlays(plays, "cover", "offense")).toHaveLength(0);
  });

  it("returns everything on an empty query + all filter", () => {
    expect(filterPlays(plays, "  ", "all")).toHaveLength(3);
  });
});
