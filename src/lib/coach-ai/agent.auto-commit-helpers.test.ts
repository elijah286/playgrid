/**
 * Auto-commit helpers — `rosterCountForVariant`, `extractPlayFencesFromText`,
 * `fenceIsFullRosterPlay`.
 *
 * These pin the save-by-default decision boundary. Surfaced 2026-05-20: a
 * trialing coach in an 11v11 Tackle playbook walked through Cal's 5-play
 * install one play per turn and saw nothing land in the playbook until they
 * explicitly typed "save them all" at the end. The new behavior auto-commits
 * full-roster fences the moment Cal emits them; demos (rule 9a — single
 * route, single defender) stay exploratory.
 *
 * The bar these tests pin:
 *   - Full-roster fences SAVE (11-player tackle play, 7-player flag play).
 *   - Single-element demos SKIP (QB + receiver = 2 players, never a play).
 *   - Variant matters: 7 players in flag_7v7 = play; 7 players in tackle_11 =
 *     incomplete (skipped).
 *   - Defense-only fences with the full defender count SAVE (a "Cover 2"
 *     diagram is a defense play, not a demo).
 *   - The fence extractor handles multiple fences in one assistant reply.
 */

import { describe, expect, it } from "vitest";
import {
  rosterCountForVariant,
  extractPlayFencesFromText,
  fenceIsFullRosterPlay,
} from "./agent";

describe("rosterCountForVariant", () => {
  it("returns 11 for tackle_11", () => {
    expect(rosterCountForVariant("tackle_11")).toBe(11);
  });

  it("returns 7 for flag_7v7", () => {
    expect(rosterCountForVariant("flag_7v7")).toBe(7);
  });

  it("returns 6 for flag_6v6", () => {
    expect(rosterCountForVariant("flag_6v6")).toBe(6);
  });

  it("returns 5 for flag_5v5", () => {
    expect(rosterCountForVariant("flag_5v5")).toBe(5);
  });

  it("returns conservative 5 for unknown / other / null", () => {
    expect(rosterCountForVariant("other")).toBe(5);
    expect(rosterCountForVariant(null)).toBe(5);
    expect(rosterCountForVariant(undefined)).toBe(5);
    expect(rosterCountForVariant("bogus_variant")).toBe(5);
  });
});

describe("extractPlayFencesFromText", () => {
  it("returns the JSON body of a single ```play fence", () => {
    const text = 'Here is Inside Zone:\n\n```play\n{"players":[]}\n```\n\nReady for play 2?';
    expect(extractPlayFencesFromText(text)).toEqual(['{"players":[]}']);
  });

  it("returns all fences when multiple are present", () => {
    const text =
      '```play\n{"id":"p1"}\n```\nSome text.\n```play\n{"id":"p2"}\n```\nMore text.\n```play\n{"id":"p3"}\n```';
    expect(extractPlayFencesFromText(text)).toEqual([
      '{"id":"p1"}',
      '{"id":"p2"}',
      '{"id":"p3"}',
    ]);
  });

  it("returns empty array when no fence is present", () => {
    expect(extractPlayFencesFromText("Just prose, no diagrams.")).toEqual([]);
    expect(extractPlayFencesFromText("")).toEqual([]);
  });

  it("ignores non-play code fences", () => {
    const text = '```ts\nconst x = 1;\n```\n```json\n{}\n```';
    expect(extractPlayFencesFromText(text)).toEqual([]);
  });
});

describe("fenceIsFullRosterPlay", () => {
  it("returns true for an 11-offense tackle_11 play (Inside Zone shape)", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "B", team: "O" },
        { id: "LT", team: "O" }, { id: "LG", team: "O" }, { id: "C", team: "O" },
        { id: "RG", team: "O" }, { id: "RT", team: "O" },
        { id: "X", team: "O" }, { id: "Z", team: "O" },
        { id: "H", team: "O" }, { id: "S", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(true);
  });

  it("returns true for a 7-offense flag_7v7 play", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" }, { id: "B", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" },
        { id: "Z", team: "O" }, { id: "H", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(true);
  });

  it("returns true for a 5-offense flag_5v5 play", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" }, { id: "Z", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_5v5")).toBe(true);
  });

  it("returns false for a single-route demo (QB + receiver, 2 players)", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" },
        { id: "X", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(false);
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(false);
    expect(fenceIsFullRosterPlay(fence, "flag_5v5")).toBe(false);
  });

  it("returns false for a single-defender demo (QB + receiver + defender)", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" },
        { id: "X", team: "O" },
        { id: "CB", team: "D" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(false);
  });

  it("variant matters: 7 offensive players is a play in flag_7v7 but NOT in tackle_11", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" }, { id: "B", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" },
        { id: "Z", team: "O" }, { id: "H", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(true);
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(false);
  });

  it("returns true for a defense-only Cover 2 in flag_7v7 (7 defenders, no offense)", () => {
    const fence = {
      players: [
        { id: "LB1", team: "D" }, { id: "LB2", team: "D" },
        { id: "CB1", team: "D" }, { id: "CB2", team: "D" },
        { id: "S1", team: "D" }, { id: "S2", team: "D" },
        { id: "NB", team: "D" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(true);
  });

  it("returns true for a full-offense + full-defense matchup (rule 8a)", () => {
    const players: Array<{ id: string; team: string }> = [];
    for (let i = 0; i < 11; i++) players.push({ id: `O${i}`, team: "O" });
    for (let i = 0; i < 11; i++) players.push({ id: `D${i}`, team: "D" });
    expect(fenceIsFullRosterPlay({ players }, "tackle_11")).toBe(true);
  });

  it("returns false for an empty fence", () => {
    expect(fenceIsFullRosterPlay({ players: [] }, "tackle_11")).toBe(false);
    expect(fenceIsFullRosterPlay({}, "tackle_11")).toBe(false);
  });

  it("falls back to total player count when team field is absent (legacy fences)", () => {
    const fence = {
      players: [
        { id: "QB" }, { id: "B" },
        { id: "LT" }, { id: "LG" }, { id: "C" },
        { id: "RG" }, { id: "RT" },
        { id: "X" }, { id: "Z" }, { id: "H" }, { id: "S" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(true);
  });

  it("handles unknown variants with the conservative 5-player floor", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" }, { id: "Z", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "other")).toBe(true);
    expect(fenceIsFullRosterPlay(fence, null)).toBe(true);
  });
});
