import { describe, expect, it } from "vitest";
import { findTemplate } from "@/domain/play/routeTemplates";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { synthesizeOffense } from "@/domain/play/offensiveSynthesize";
import { sportProfileForVariant } from "@/domain/play/factory";
import { parsePlaySpec } from "@/domain/play/spec";
import { validateRouteAssignments } from "@/lib/coach-ai/route-assignment-validate";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import {
  synthesizePlaySpec,
  formationCandidates,
  observedSkillPlayers,
  variantFit,
  applySheetIdentity,
  applyPhotoAlignment,
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

/** Play 1 from the Bomb Squad sheet: Z wide left, B tucked behind the
 *  line left of center with jet motion across to the right, Y slot
 *  left, X slot right, A wide right. */
function motionExtraction(): PlayExtraction {
  return {
    title: "Play 1",
    players: [
      { label: "Z", side: "left", orderFromLeft: 1, width: "wide", color: "black", onLos: true, backfield: false },
      { label: "B", side: "left", orderFromLeft: 2, width: "tight", color: "yellow", onLos: false, backfield: false },
      { label: "Y", side: "left", orderFromLeft: 3, width: "slot", color: "green", onLos: true, backfield: false },
      { label: "C", side: "center", orderFromLeft: 4, width: "middle", color: "black", onLos: true, backfield: false },
      { label: "Q", side: "center", orderFromLeft: 5, width: "middle", color: "gray", onLos: false, backfield: true },
      { label: "X", side: "right", orderFromLeft: 6, width: "slot", color: "red", onLos: true, backfield: false },
      { label: "A", side: "right", orderFromLeft: 7, width: "wide", color: "blue", onLos: true, backfield: false },
    ],
    formation: { name: "Spread Doubles", confidence: "med" },
    assignments: [
      { player: "Z", kind: "route", family: "In", depthYds: 5, direction: "right", confidence: "high" },
      {
        player: "B",
        kind: "route",
        family: "Flat",
        depthYds: 2,
        direction: "right",
        modifiers: ["motion"],
        routeStart: { side: "right", width: "wide" },
        confidence: "med",
      },
      { player: "Y", kind: "route", family: "Seam", depthYds: 12, confidence: "high" },
      { player: "X", kind: "route", family: "Corner", depthYds: 12, direction: "right", confidence: "high" },
      { player: "A", kind: "route", family: "Post", depthYds: 15, confidence: "med" },
    ],
  };
}

describe("alignment targets", () => {
  const halfW = sportProfileForVariant("flag_7v7").fieldWidthYds / 2;
  const wideX = Math.max(8, halfW - 3.5);

  it("places players by bucket: wide/slot/tight, LOS/wing", () => {
    const res = synthesizePlaySpec(motionExtraction(), { variant: "flag_7v7" });
    const byLabel = new Map(res.mapping.map((m) => [m.sheetLabel, m]));
    expect(byLabel.get("Z")!.align).toEqual({ x: -wideX, y: 0 });
    expect(byLabel.get("B")!.align).toEqual({ x: -3, y: -1.2 });
    expect(byLabel.get("Y")!.align).toEqual({ x: -6.5, y: 0 });
    expect(byLabel.get("X")!.align).toEqual({ x: 6.5, y: 0 });
    expect(byLabel.get("A")!.align).toEqual({ x: wideX, y: 0 });
  });

  it("computes the motion launch point at the player's own depth", () => {
    const res = synthesizePlaySpec(motionExtraction(), { variant: "flag_7v7" });
    const b = res.mapping.find((m) => m.sheetLabel === "B")!;
    expect(b.routeStartAt).toEqual({ x: wideX, y: -1.2 });
    // Non-motion players don't get a launch point.
    expect(res.mapping.find((m) => m.sheetLabel === "Z")!.routeStartAt).toBeUndefined();
  });

  it("spreads same-row collisions but leaves cross-depth stacks alone", () => {
    const ext = motionExtraction();
    // Force Y onto Z's exact bucket (both wide-left on the line).
    ext.players = ext.players.map((p) => (p.label === "Y" ? { ...p, width: "wide" } : p));
    const res = synthesizePlaySpec(ext, { variant: "flag_7v7" });
    const z = res.mapping.find((m) => m.sheetLabel === "Z")!.align!;
    const y = res.mapping.find((m) => m.sheetLabel === "Y")!.align!;
    expect(Math.abs(z.x - y.x)).toBeGreaterThanOrEqual(2);
    // B sits at a different depth near Z's x — untouched by the spread.
    expect(res.mapping.find((m) => m.sheetLabel === "B")!.align).toEqual({ x: -3, y: -1.2 });
  });
});

describe("applyPhotoAlignment", () => {
  it("moves players, carries routes, draws motion, and stays valid", () => {
    const res = synthesizePlaySpec(motionExtraction(), { variant: "flag_7v7" });
    const rendered = playSpecToCoachDiagram(res.spec);
    const aligned = applyPhotoAlignment(rendered.diagram, res.mapping, "flag_7v7");

    const byLabel = new Map(res.mapping.map((m) => [m.sheetLabel, m]));
    const playerById = new Map(aligned.players.map((p) => [p.id, p]));

    // Players sit at their photo positions.
    for (const label of ["Z", "B", "Y", "X", "A"]) {
      const m = byLabel.get(label)!;
      const p = playerById.get(m.rosterId)!;
      expect({ x: p.x, y: p.y }, label).toEqual(m.align);
    }

    // B's route: dashed motion to the launch point, path anchored there,
    // and the catalog tag stripped (freeform geometry post-motion).
    const b = byLabel.get("B")!;
    const bRoute = (aligned.routes ?? []).find((r) => r.from === b.rosterId)!;
    expect(bRoute.motion).toEqual([[b.routeStartAt!.x, b.routeStartAt!.y]]);
    expect(Math.min(...bRoute.path.map(([x]) => x))).toBeGreaterThan(0); // launched right of center
    expect((bRoute as { route_kind?: string }).route_kind).toBeUndefined();

    // Z's route traveled with Z (path stays on the left half near the player).
    const z = byLabel.get("Z")!;
    const zRoute = (aligned.routes ?? []).find((r) => r.from === z.rosterId)!;
    expect(zRoute.motion).toBeUndefined();
    expect(zRoute.path[0][0]).toBeLessThan(0);

    // Every coordinate survived sanitization and the depth gates still pass.
    for (const r of aligned.routes ?? []) {
      for (const [x, y] of r.path) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
    const check = validateRouteAssignments(aligned, { variant: "flag_7v7" });
    expect(check.ok, JSON.stringify(!check.ok ? check.errors : [])).toBe(true);
  });

  it("keeps playbook lettering when labels are off (colors still apply)", () => {
    const res = synthesizePlaySpec(motionExtraction(), { variant: "flag_7v7" });
    const rendered = playSpecToCoachDiagram(res.spec);
    const out = applySheetIdentity(rendered.diagram, res.mapping, { labels: false });
    // Sheet Z sits wide left, whose Spread Doubles slot is a different
    // letter — the meaningful case for the toggle.
    const z = res.mapping.find((m) => m.sheetLabel === "Z")!;
    expect(z.rosterId).not.toBe("Z");
    const player = out.players.find((p) => p.id === z.rosterId)!;
    expect(player.role ?? player.id).not.toBe("Z");
    expect(player.color).toBe(SHEET_COLOR_HEX.black);
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
