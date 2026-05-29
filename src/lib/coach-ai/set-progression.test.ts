/**
 * `withProgression` — the pure core of the `set_progression` tool.
 *
 * The tool lets Cal set a QB read order ("1, 2, 3") on an ALREADY-SAVED
 * play without reconstructing the whole spec. Surfaced 2026-05-28: a
 * coach asked Cal to "add a progression to Smash Right showing @Q's read
 * sequence"; Cal called `update_play_notes` (prose only), so the
 * structured `spec.progression` field stayed empty and no numbered
 * badges rendered. `withProgression` is the validated transform the new
 * tool applies to the play's saved spec before re-persisting through the
 * resolver.
 *
 * Rule 1 / Rule 12: failing test first, validator gate gets a positive
 * + one test per rejection mode.
 */

import { describe, expect, it } from "vitest";
import { stampProgressionIndex, withProgression } from "./play-tools";
import type { PlaySpec } from "@/domain/play/spec";

function specWith(assignments: PlaySpec["assignments"]): PlaySpec {
  return {
    schemaVersion: 1,
    title: "Smash Right",
    variant: "flag_7v7",
    formation: "trips_right",
    assignments,
  } as unknown as PlaySpec;
}

const baseSpec = specWith([
  { player: "S", action: { kind: "route", family: "Corner" } },
  { player: "Z", action: { kind: "route", family: "Hitch" } },
  { player: "B", action: { kind: "route", family: "Flat" } },
  { player: "C", action: { kind: "block" } },
  { player: "QB", action: { kind: "unspecified" } },
] as PlaySpec["assignments"]);

describe("withProgression", () => {
  it("sets a valid read order of receivers on the spec", () => {
    const r = withProgression(baseSpec, ["S", "Z", "B"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.progression).toEqual(["S", "Z", "B"]);
  });

  it("clears the progression when given an empty order", () => {
    const withOrder = withProgression(baseSpec, ["S", "Z"]);
    expect(withOrder.ok).toBe(true);
    if (!withOrder.ok) return;
    const cleared = withProgression(withOrder.spec, []);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.spec.progression).toBeUndefined();
  });

  it("rejects an id that names a non-route assignment (blocker)", () => {
    const r = withProgression(baseSpec, ["S", "C"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/C/);
  });

  it("rejects an id that names no player in the play", () => {
    const r = withProgression(baseSpec, ["S", "ZZ"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ZZ/);
  });

  it("rejects a duplicate id in the read order", () => {
    const r = withProgression(baseSpec, ["S", "S"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/S/);
  });

  it("does not mutate the input spec", () => {
    const before = JSON.stringify(baseSpec);
    withProgression(baseSpec, ["S", "Z"]);
    expect(JSON.stringify(baseSpec)).toBe(before);
  });
});

describe("stampProgressionIndex", () => {
  const players: { label: string; x: number; y: number; progressionIndex?: number }[] = [
    { label: "S", x: 10, y: 20 },
    { label: "Z", x: 30, y: 20 },
    { label: "B", x: 50, y: 20 },
    { label: "QB", x: 25, y: 5 },
  ];

  it("stamps 1-based badge numbers by label, preserving positions", () => {
    const out = stampProgressionIndex(players, ["S", "Z", "B"]);
    expect(out.map((p) => [p.label, p.progressionIndex])).toEqual([
      ["S", 1],
      ["Z", 2],
      ["B", 3],
      ["QB", undefined],
    ]);
    // positions untouched
    out.forEach((p, i) => {
      expect(p.x).toBe(players[i].x);
      expect(p.y).toBe(players[i].y);
    });
  });

  it("clears stale badges when a player drops out of the order", () => {
    const stamped = stampProgressionIndex(players, ["S", "Z"]);
    const cleared = stampProgressionIndex(stamped, ["S"]);
    expect(cleared.find((p) => p.label === "Z")?.progressionIndex).toBeUndefined();
    expect(cleared.find((p) => p.label === "S")?.progressionIndex).toBe(1);
  });

  it("clears all badges on an empty order", () => {
    const stamped = stampProgressionIndex(players, ["S", "Z", "B"]);
    const cleared = stampProgressionIndex(stamped, []);
    expect(cleared.every((p) => p.progressionIndex === undefined)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const before = JSON.stringify(players);
    stampProgressionIndex(players, ["S", "Z"]);
    expect(JSON.stringify(players)).toBe(before);
  });
});
