import { describe, expect, it } from "vitest";
import { findTemplate } from "@/domain/play/routeTemplates";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { synthesizeOffense } from "@/domain/play/offensiveSynthesize";
import { parsePlaySpec } from "@/domain/play/spec";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import {
  synthesizePlaySpec,
  formationCandidates,
  observedSkillPlayers,
  variantFit,
  applySheetIdentity,
  rewriteNotesToSheetLabels,
  SHEET_COLOR_HEX,
} from "./synthesize";
import type { PlayExtraction } from "./schema";

function midDepth(family: string): number {
  const t = findTemplate(family)!;
  const { min, max } = t.constraints.depthRangeYds;
  return Math.round((min + max) / 2);
}

/** A clean 7v7 trips-left read, depths mid-range so no clamping fires. */
function tripsLeftExtraction(): PlayExtraction {
  return {
    title: "Play 8",
    players: [
      { label: "X", side: "left", orderFromLeft: 1, onLos: true, backfield: false },
      { label: "B", side: "left", orderFromLeft: 2, onLos: false, backfield: false },
      { label: "Y", side: "left", orderFromLeft: 3, onLos: true, backfield: false },
      { label: "C", side: "center", orderFromLeft: 4, onLos: true, backfield: false },
      { label: "Q", side: "center", orderFromLeft: 5, onLos: false, backfield: true },
      { label: "A", side: "right", orderFromLeft: 6, onLos: false, backfield: false },
      { label: "Z", side: "right", orderFromLeft: 7, onLos: true, backfield: false },
    ],
    formation: { name: "Trips Left", confidence: "high" },
    assignments: [
      { player: "X", kind: "route", family: "Go", depthYds: midDepth("Go"), confidence: "high" },
      { player: "B", kind: "route", family: "Seam", depthYds: midDepth("Seam"), confidence: "med" },
      { player: "Y", kind: "route", family: "Hitch", depthYds: midDepth("Hitch"), confidence: "high" },
      { player: "A", kind: "route", family: "In", depthYds: midDepth("In"), confidence: "med" },
      { player: "Z", kind: "route", family: "Corner", depthYds: midDepth("Corner"), direction: "right", confidence: "low" },
    ],
  };
}

describe("synthesizePlaySpec — happy path", () => {
  it("maps five sheet players onto distinct roster slots and builds a valid spec", () => {
    const res = synthesizePlaySpec(tripsLeftExtraction(), { variant: "flag_7v7" });

    expect(res.spec.formation.name).toBe("Trips Left");
    expect(res.spec.variant).toBe("flag_7v7");
    expect(res.spec.title).toBe("Play 8");

    expect(res.mapping).toHaveLength(5);
    const rosterIds = res.mapping.map((m) => m.rosterId);
    expect(new Set(rosterIds).size).toBe(5);
    expect(rosterIds).not.toContain("QB");
    expect(rosterIds).not.toContain("C");
    // Sheet order preserved left-to-right.
    expect(res.mapping.map((m) => m.sheetLabel)).toEqual(["X", "B", "Y", "A", "Z"]);

    // Every mapped player got a route; confidences carried through.
    const routes = res.spec.assignments.filter((a) => a.action.kind === "route");
    expect(routes).toHaveLength(5);
    const zRoster = res.mapping.find((m) => m.sheetLabel === "Z")!.rosterId;
    const zAssignment = res.spec.assignments.find((a) => a.player === zRoster)!;
    expect(zAssignment.confidence).toBe("low");
    expect(zAssignment.action).toMatchObject({ kind: "route", family: "Corner", direction: "right" });

    // The spec passes the strict runtime schema (what the save route enforces).
    expect(parsePlaySpec(res.spec).success).toBe(true);

    // No clamp warnings on mid-range depths.
    expect(res.warnings.filter((w) => w.code.startsWith("depth"))).toHaveLength(0);
  });

  it("renders through the real spec renderer with no missing-player warnings", () => {
    const res = synthesizePlaySpec(tripsLeftExtraction(), { variant: "flag_7v7" });
    const rendered = playSpecToCoachDiagram(res.spec);
    const missing = rendered.warnings.filter(
      (w) => w.code === "assignment_player_missing" || w.code === "formation_fallback",
    );
    expect(missing).toEqual([]);
    // Five route paths made it onto the diagram.
    expect((rendered.diagram.routes ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

describe("synthesizePlaySpec — depth clamping", () => {
  it("raises a too-shallow read to the family floor with a warning", () => {
    const ext = tripsLeftExtraction();
    const seamMin = findTemplate("Seam")!.constraints.depthRangeYds.min;
    ext.assignments[1] = { player: "B", kind: "route", family: "Seam", depthYds: seamMin - 3, confidence: "med" };
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    const b = res.mapping.find((m) => m.sheetLabel === "B")!.rosterId;
    const action = res.spec.assignments.find((a) => a.player === b)!.action;
    expect(action).toMatchObject({ kind: "route", family: "Seam", depthYds: seamMin });
    expect(res.warnings.some((w) => w.code === "depth_raised")).toBe(true);
  });

  it("caps a too-deep read at the family ceiling with a warning", () => {
    const ext = tripsLeftExtraction();
    const dragMax = findTemplate("Drag")!.constraints.depthRangeYds.max;
    ext.assignments[2] = { player: "Y", kind: "route", family: "Drag", depthYds: dragMax + 10, confidence: "high" };
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    const y = res.mapping.find((m) => m.sheetLabel === "Y")!.rosterId;
    const action = res.spec.assignments.find((a) => a.player === y)!.action;
    expect(action).toMatchObject({ kind: "route", family: "Drag", depthYds: dragMax });
    expect(res.warnings.some((w) => w.code === "depth_capped")).toBe(true);
  });

  it("honors a playbook throw cap, flagging nonCanonical when the cap undercuts the family floor", () => {
    const ext = tripsLeftExtraction();
    const go = findTemplate("Go")!.constraints.depthRangeYds;
    const cap = go.min - 2; // below the family floor
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7", maxThrowDepthYds: cap });
    const x = res.mapping.find((m) => m.sheetLabel === "X")!.rosterId;
    const action = res.spec.assignments.find((a) => a.player === x)!.action;
    expect(action).toMatchObject({ kind: "route", family: "Go", depthYds: cap, nonCanonical: true });
    expect(res.warnings.some((w) => w.code === "depth_over_throw_cap")).toBe(true);
  });
});

describe("synthesizePlaySpec — degraded reads", () => {
  it("imports an unknown family as unassigned with a warning", () => {
    const ext = tripsLeftExtraction();
    ext.assignments[0] = { player: "X", kind: "route", family: "Bootleg Banana", confidence: "low" };
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    const x = res.mapping.find((m) => m.sheetLabel === "X")!.rosterId;
    expect(res.spec.assignments.find((a) => a.player === x)!.action).toEqual({ kind: "unspecified" });
    expect(res.warnings.some((w) => w.code === "family_unknown")).toBe(true);
  });

  it("fills unclaimed roster slots with explicit unassigned entries", () => {
    const ext = tripsLeftExtraction();
    ext.assignments = ext.assignments.slice(0, 4); // Z never read
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    const z = res.mapping.find((m) => m.sheetLabel === "Z")!.rosterId;
    expect(res.spec.assignments.find((a) => a.player === z)!.action).toEqual({ kind: "unspecified" });
    expect(res.warnings.some((w) => w.code === "player_unassigned")).toBe(true);
  });

  it("drops surplus sheet players with a count-mismatch warning", () => {
    const ext = tripsLeftExtraction();
    ext.players.push({ label: "W", side: "right", orderFromLeft: 8, onLos: true, backfield: false });
    ext.assignments.push({ player: "W", kind: "route", family: "Flat", depthYds: 2, confidence: "low" });
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    expect(res.warnings.some((w) => w.code === "player_count_mismatch")).toBe(true);
    expect(res.warnings.some((w) => w.code === "player_unmapped")).toBe(true);
    expect(res.mapping.map((m) => m.sheetLabel)).not.toContain("W");
  });

  it("skips QB/C assignments with a note and keeps motion/carry/block kinds", () => {
    const ext = tripsLeftExtraction();
    ext.assignments.push({ player: "Q", kind: "carry", confidence: "med" });
    ext.assignments[1] = { player: "B", kind: "carry", modifiers: ["motion"], confidence: "med" };
    ext.assignments[2] = { player: "Y", kind: "block", confidence: "high" };
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    expect(res.warnings.some((w) => w.code === "assignment_skipped")).toBe(true);
    const b = res.mapping.find((m) => m.sheetLabel === "B")!.rosterId;
    const y = res.mapping.find((m) => m.sheetLabel === "Y")!.rosterId;
    expect(res.spec.assignments.find((a) => a.player === b)!.action).toMatchObject({ kind: "carry", runType: "sweep" });
    expect(res.spec.assignments.find((a) => a.player === y)!.action).toEqual({ kind: "block" });
  });

  it("filters non-catalog modifiers", () => {
    const ext = tripsLeftExtraction();
    ext.assignments[0] = {
      player: "X",
      kind: "route",
      family: "Flat",
      depthYds: 2,
      modifiers: ["motion", "totally-made-up"],
      confidence: "med",
    };
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    const x = res.mapping.find((m) => m.sheetLabel === "X")!.rosterId;
    const action = res.spec.assignments.find((a) => a.player === x)!.action;
    expect(action).toMatchObject({ kind: "route", modifiers: ["motion"] });
  });
});

describe("depth-aware mapping", () => {
  it("maps the backfield sheet player onto a backfield roster slot", () => {
    // First prod test (2026-07-03): a flat left-to-right zip put the
    // offset back on an on-LOS slot, scrambling routes onto the wrong
    // players. Spread Doubles has a known backfield slot (B at y≈-5).
    const ext = tripsLeftExtraction();
    ext.formation = { name: "Spread Doubles", confidence: "high" };
    ext.players = ext.players.map((p) =>
      p.label === "B" ? { ...p, onLos: false, backfield: true } : p,
    );
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });

    const synth = synthesizeOffense("flag_7v7", res.spec.formation.name)!;
    const yById = new Map(synth.players.map((p) => [p.id, p.y]));

    const bSlot = res.mapping.find((m) => m.sheetLabel === "B")!.rosterId;
    expect(yById.get(bSlot)).toBeLessThanOrEqual(-1.5);
    // Line players stay on line slots.
    for (const label of ["X", "Y", "A", "Z"]) {
      const slot = res.mapping.find((m) => m.sheetLabel === label)!.rosterId;
      expect(yById.get(slot), `${label} → ${slot}`).toBeGreaterThan(-1.5);
    }
    expect(res.warnings.filter((w) => w.code === "player_mapping_cross_depth")).toHaveLength(0);
  });

  it("cross-fills with a warning when depth groups don't line up", () => {
    // Two backfield players into a one-back formation: the second back
    // must land somewhere, flagged rather than dropped.
    const ext = tripsLeftExtraction();
    ext.formation = { name: "Spread Doubles", confidence: "high" };
    ext.players = ext.players.map((p) =>
      p.label === "B" || p.label === "Y" ? { ...p, onLos: false, backfield: true } : p,
    );
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    expect(res.mapping).toHaveLength(5);
    expect(res.warnings.some((w) => w.code === "player_mapping_cross_depth")).toBe(true);
  });

  it("carries the sheet color into the mapping", () => {
    const ext = tripsLeftExtraction();
    ext.players = ext.players.map((p) => (p.label === "Z" ? { ...p, color: "black" } : p));
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    expect(res.mapping.find((m) => m.sheetLabel === "Z")!.sheetColor).toBe("black");
  });
});

describe("variantFit", () => {
  it("flags a 7v7 sheet against a 5v5 playbook and accepts the matching variant", () => {
    const ext = tripsLeftExtraction(); // 5 skill players + C + Q
    expect(variantFit(ext, "flag_7v7").delta).toBe(0);
    const misfit = variantFit(ext, "flag_5v5");
    expect(misfit.expectedPlayers).toBe(5);
    expect(misfit.delta).toBe(2);
    expect(misfit.photoPlayers).toBe(7);
  });
});

describe("sheet identity", () => {
  it("relabels and recolors mapped players only", () => {
    const diagram: CoachDiagram = {
      variant: "flag_7v7",
      players: [
        { id: "X", role: "X", team: "O" },
        { id: "B", role: "B", team: "O", color: "#123456" },
        { id: "QB", role: "QB", team: "O" },
        { id: "C", role: "C", team: "O" },
      ],
      routes: [],
    } as unknown as CoachDiagram;
    const out = applySheetIdentity(diagram, [
      { sheetLabel: "Z", rosterId: "X", sheetColor: "black" },
      { sheetLabel: "A", rosterId: "B" }, // no color read — keeps existing
    ]);
    const byId = new Map(out.players.map((p) => [p.id, p]));
    expect(byId.get("X")).toMatchObject({ id: "X", role: "Z", color: SHEET_COLOR_HEX.black });
    expect(byId.get("B")).toMatchObject({ id: "B", role: "A", color: "#123456" });
    expect(byId.get("QB")!.role).toBe("QB");
    // Pure: input untouched.
    expect(diagram.players.find((p) => p.id === "X")!.role).toBe("X");
  });

  it("rewrites notes to sheet letters without collision chains", () => {
    // sheet-Z→roster-X and sheet-X→roster-B: a naive sequential replace
    // would turn @B into @X and then that @X into @Z.
    const mapping = [
      { sheetLabel: "Z", rosterId: "X" },
      { sheetLabel: "X", rosterId: "B" },
    ];
    expect(rewriteNotesToSheetLabels("@X drags right while @B runs the flat.", mapping)).toBe(
      "@Z drags right while @X runs the flat.",
    );
  });

  it("consumes longer roster ids before their prefixes", () => {
    const mapping = [
      { sheetLabel: "Q1", rosterId: "Z" },
      { sheetLabel: "Q2", rosterId: "Z2" },
    ];
    expect(rewriteNotesToSheetLabels("@Z and @Z2 cross.", mapping)).toBe("@Q1 and @Q2 cross.");
  });
});

describe("formation candidates", () => {
  it("falls back from an unparseable name to the distribution guess with a warning", () => {
    const ext = tripsLeftExtraction();
    ext.formation = { name: "Banana Split", confidence: "low" };
    const candidates = formationCandidates(ext);
    expect(candidates[0]).toBe("Banana Split");
    expect(candidates).toContain("Trips Left");
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    expect(res.spec.formation.name).toBe("Trips Left");
    expect(res.warnings.some((w) => w.code === "formation_fallback")).toBe(true);
  });

  it("appends a strength-suffixed variant when the name lacks a side", () => {
    const ext = tripsLeftExtraction();
    ext.formation = { name: "Bunch", strength: "left", confidence: "med" };
    expect(formationCandidates(ext).slice(0, 2)).toEqual(["Bunch", "Bunch Left"]);
  });

  it("orders observed skill players by orderFromLeft and excludes C/Q", () => {
    const observed = observedSkillPlayers(tripsLeftExtraction());
    expect(observed.map((p) => p.label)).toEqual(["X", "B", "Y", "A", "Z"]);
  });
});
