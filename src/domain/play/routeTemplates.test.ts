/**
 * Catalog round-trip tests.
 *
 * For every named route in ROUTE_TEMPLATES, instantiate it through the
 * production `instantiateTemplate()` path and assert:
 *   1. The result satisfies the template's own `constraints` (depth + side)
 *      — catches drift between the catalog and the instantiation function.
 *   2. The break-direction invariant holds in normalized field coords —
 *      catches drift between the renderer's view and the catalog's claim.
 *   3. The route's segment shapes match the template's declared shapes —
 *      catches "curl drawn straight" / "slant drawn curved" failures.
 *
 * These are the cheapest, highest-signal tests in the harness. Every
 * template is exercised on both sides of the field (left + right), so
 * mirroring bugs surface here too.
 *
 * Module-load assertions in routeTemplates.ts already crash on import if
 * the catalog is internally inconsistent. These tests cover the *runtime*
 * path: instantiate → render → measure.
 */

import { describe, expect, it } from "vitest";
import {
  ROUTE_TEMPLATES,
  instantiateTemplate,
  type RouteTemplate,
  type BreakDirection,
} from "./routeTemplates";

const FIELD_LENGTH_YDS = 25; // every variant uses 25yd field length
const FIELD_WIDTH_YDS_FLAG_7v7 = 30; // pick one variant for measurements
const LOS_Y_NORM = 0.4;

/** Player position in normalized coords on the LEFT side of the field. */
const LEFT_PLAYER = { x: 0.2, y: LOS_Y_NORM };
/** Player position on the RIGHT side. Tests mirroring works. */
const RIGHT_PLAYER = { x: 0.8, y: LOS_Y_NORM };

/** Convert a normalized coord to yards from LOS / center. */
function normToYds(norm: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (norm.x - 0.5) * FIELD_WIDTH_YDS_FLAG_7v7,
    y: (norm.y - LOS_Y_NORM) * FIELD_LENGTH_YDS,
  };
}

/** Deepest signed yard offset reached by a list of waypoints relative to the
 *  carrier. Mirrors the validator's depth measurement so they stay aligned. */
function deepestDepthYds(
  carrierYds: { x: number; y: number },
  waypointsYds: Array<{ x: number; y: number }>,
): number {
  let deepest = 0;
  for (const wp of waypointsYds) {
    const dy = wp.y - carrierYds.y;
    if (Math.abs(dy) > Math.abs(deepest)) deepest = dy;
  }
  return deepest;
}

describe("ROUTE_TEMPLATES catalog", () => {
  it("has at least 24 named routes (catches accidental deletions)", () => {
    expect(ROUTE_TEMPLATES.length).toBeGreaterThanOrEqual(24);
  });

  it("every template has a unique name (case-insensitive)", () => {
    const names = new Set<string>();
    for (const t of ROUTE_TEMPLATES) {
      const key = t.name.toLowerCase();
      expect(names.has(key), `duplicate template name "${t.name}"`).toBe(false);
      names.add(key);
    }
  });

  it("every template has constraints (no undefined slipping in)", () => {
    for (const t of ROUTE_TEMPLATES) {
      expect(t.constraints, `${t.name} missing constraints`).toBeDefined();
      expect(
        t.constraints.depthRangeYds.min,
        `${t.name} min not a number`,
      ).toBeTypeOf("number");
      expect(
        t.constraints.depthRangeYds.max,
        `${t.name} max not a number`,
      ).toBeTypeOf("number");
      expect(
        t.constraints.depthRangeYds.min <= t.constraints.depthRangeYds.max,
        `${t.name} has inverted range`,
      ).toBe(true);
    }
  });

  // Rule 3 enforcement (AGENTS.md "Coach Cal architecture: hard rules"):
  // adding a route to the catalog REQUIRES a coaching cue in
  // notes-from-spec.ts ROUTE_CUES so the spec → notes projection can
  // describe it. Without this assertion, a coach who composes a play
  // with the new family would get a generic, cue-less bullet — words
  // would silently degrade from the play.
  //
  // The check uses dynamic import to avoid a circular dep between the
  // catalog module and the notes module.
  it("every template has a coaching cue in notes-from-spec ROUTE_CUES (Rule 3 lockstep)", async () => {
    // Dynamic import keeps catalog → tests one-way (the catalog must
    // not depend on the notes module at module-load time).
    const notesModule: typeof import("@/lib/coach-ai/notes-from-spec") = await import(
      "@/lib/coach-ai/notes-from-spec"
    );
    // ROUTE_CUES isn't exported, so we exercise the projector and
    // assert the cue appears in the rendered output. A missing cue
    // produces a bullet without the trailing " — <cue>." clause; we
    // assert the dash separator is present for every catalog family.
    const { projectSpecToNotes } = notesModule;
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("./spec");
    for (const template of ROUTE_TEMPLATES) {
      const notes = projectSpecToNotes({
        schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
        variant: "flag_7v7",
        title: "Cue coverage probe",
        playType: "offense",
        formation: { name: "Spread Doubles" },
        assignments: [{ player: "X", action: { kind: "route", family: template.name } }],
      });
      // The bullet line for @X.
      const bullet = notes.split("\n").find((l) => l.startsWith("- @X:"));
      expect(bullet, `${template.name} produced no @X bullet`).toBeDefined();
      expect(
        bullet,
        `${template.name} bullet has no coaching cue — add one to ROUTE_CUES in notes-from-spec.ts (Rule 3 lockstep)`,
      ).toMatch(/—.+\.$/);
    }
  });
});

describe("Drag — canonical 'release flat, cross full formation' shape", () => {
  // The canonical drag (Throw Deep / Hudl playbook art): a brief inside
  // release stem (~1 yd vertical), then a NEARLY-FLAT cross all the way
  // across the formation. Coaches reading the rendered diagram should see
  // a horizontal route, not a steady upfield diagonal.
  //
  // Production bug 2026-05-01: Cal's drag rendered as a single straight
  // diagonal — depth-gain-to-lateral ratio of ~0.30, so it read as a
  // climbing route rather than a horizontal cross. Geometry was within
  // the depth constraint but the visual failed the coach's eye test.
  const drag = ROUTE_TEMPLATES.find((t) => t.name === "Drag");
  if (!drag) throw new Error("Drag template missing");
  it("cross segments after release have ZERO depth gain (pinned-flat cross)", () => {
    // Narrow-aspect chat preview compresses x by ~57%, so any depth
    // gain across the cross segments shows up as a visible diagonal.
    // Solution: pin every cross-segment waypoint at the same y so the
    // route renders as a true horizontal arc. The release segment
    // (first segment) is allowed to gain depth — the cross segments
    // (every segment after) must not.
    expect(drag.points.length).toBeGreaterThanOrEqual(3);
    const releaseEndY = drag.points[1].y;
    for (let i = 2; i < drag.points.length; i++) {
      expect(
        drag.points[i].y,
        `Drag cross-segment waypoint ${i} has y=${drag.points[i].y} but release ended at y=${releaseEndY}. Cross waypoints MUST stay at the same depth — any drift produces a diagonal climb in narrow-aspect chat preview.`,
      ).toBe(releaseEndY);
    }
  });
  it("crosses ≥ 30% of the field width laterally (so the receiver actually crosses the formation)", () => {
    const last = drag.points[drag.points.length - 1];
    const lateralFraction = Math.abs(last.x);
    expect(
      lateralFraction,
      `Drag final x=${last.x} (only ${(lateralFraction * 100).toFixed(0)}% of field width). Canonical drag crosses the entire formation; bump the template to ≥ 0.40 if a constraint pushed it down.`,
    ).toBeGreaterThanOrEqual(0.30);
  });
  it("ends at shallow depth (≤ 4 yds) — never a climbing route", () => {
    const last = drag.points[drag.points.length - 1];
    const depthYds = last.y * FIELD_LENGTH_YDS;
    expect(depthYds).toBeLessThanOrEqual(4);
  });
});

describe("Visual fidelity assertions for routes whose shape was a 2026-05-01 audit miss", () => {
  // These are catalog-authored visual properties (not catalog invariants).
  // Each one corresponds to a route whose previous geometry rendered
  // wrong even though it satisfied the depth/side validators. Failing
  // any of these is a coach-eye-test regression.
  const FIELD_WIDTH_TACKLE_11 = 53;

  function template(name: string) {
    const t = ROUTE_TEMPLATES.find((r) => r.name === name);
    if (!t) throw new Error(`template ${name} missing`);
    return t;
  }

  it("Spot/Snag: ends with a settle (final waypoint is BACKWARD from the previous one)", () => {
    const t = template("Spot");
    const last = t.points[t.points.length - 1];
    const prev = t.points[t.points.length - 2];
    expect(
      last.y,
      `Spot's final point y=${last.y} must be < previous y=${prev.y} — that's the SETTLE turn-back. Without it the route has no settle and reads as a slant.`,
    ).toBeLessThan(prev.y);
  });

  it("Flat: cross segment angle ≤ 12° from horizontal in tackle_11 (it's NOT a climbing diagonal)", () => {
    const t = template("Flat");
    const last = t.points[t.points.length - 1];
    const prev = t.points[t.points.length - 2];
    const dxYds = Math.abs(last.x - prev.x) * FIELD_WIDTH_TACKLE_11;
    const dyYds = Math.abs(last.y - prev.y) * FIELD_LENGTH_YDS;
    const angleDeg = (Math.atan2(dyYds, dxYds) * 180) / Math.PI;
    expect(
      angleDeg,
      `Flat's outside segment is ${angleDeg.toFixed(1)}° — should be ≤ 12° to read as horizontal. The whole point of the route is in the name.`,
    ).toBeLessThanOrEqual(12);
  });

  it("Bubble: apex retreats ≥ 2 yds behind the LOS (it's a BUBBLE, not a now screen)", () => {
    const t = template("Bubble");
    let minY = 0;
    for (const p of t.points) {
      if (p.y < minY) minY = p.y;
    }
    const apexYds = minY * FIELD_LENGTH_YDS;
    expect(
      apexYds,
      `Bubble's apex is ${apexYds.toFixed(1)} yds back — should be ≤ -2 yds for the canonical banana arc. Without the deep apex this is a now screen.`,
    ).toBeLessThanOrEqual(-2);
  });

  it("Arrow: angle ≤ 30° from horizontal (clean diagonal, not a steep climb)", () => {
    const t = template("Arrow");
    const last = t.points[t.points.length - 1];
    const dxYds = Math.abs(last.x) * FIELD_WIDTH_TACKLE_11;
    const dyYds = Math.abs(last.y) * FIELD_LENGTH_YDS;
    const angleDeg = (Math.atan2(dyYds, dxYds) * 180) / Math.PI;
    expect(
      angleDeg,
      `Arrow's angle is ${angleDeg.toFixed(1)}° — canonical is ~25°. > 30° reads as a wheel/seam, not an arrow.`,
    ).toBeLessThanOrEqual(30);
  });
});

describe.each(ROUTE_TEMPLATES.map((t) => [t.name, t] as const))(
  "round-trip: %s",
  (_name, template: RouteTemplate) => {
    it.each([
      ["left side", LEFT_PLAYER],
      ["right side", RIGHT_PLAYER],
    ])("instantiates correctly on %s and matches its constraints", (_side, player) => {
      const route = instantiateTemplate(template, player, "test-player");

      // Carrier (the start node) is the player's position.
      expect(route.nodes[0].position.x).toBeCloseTo(player.x, 5);
      expect(route.nodes[0].position.y).toBeCloseTo(player.y, 5);

      // Convert all nodes to yards.
      const carrierYds = normToYds(player);
      const waypointsYds = route.nodes.slice(1).map((n) => normToYds(n.position));

      // 1. Depth constraint satisfied.
      const depth = deepestDepthYds(carrierYds, waypointsYds);
      const { depthRangeYds } = template.constraints;
      expect(
        depth,
        `${template.name} (${_side}) depth ${depth.toFixed(2)} outside [${depthRangeYds.min}, ${depthRangeYds.max}]`,
      ).toBeGreaterThanOrEqual(depthRangeYds.min - 0.6); // 0.5 yd validator tolerance + float slack
      expect(depth).toBeLessThanOrEqual(depthRangeYds.max + 0.6);

      // 2. Side check (final waypoint relative to carrier).
      const finalYds = waypointsYds[waypointsYds.length - 1];
      const dx = finalYds.x - carrierYds.x;
      assertSideMatches(template, dx, player.x);

      // 3. Segment shapes match template declaration (or default to straight).
      if (template.shapes) {
        expect(route.segments).toHaveLength(template.shapes.length);
        for (let i = 0; i < template.shapes.length; i++) {
          expect(
            route.segments[i].shape,
            `${template.name} segment ${i} shape mismatch`,
          ).toBe(template.shapes[i]);
        }
      }
    });
  },
);

/**
 * For a given template and final dx (yards from carrier), assert the
 * geometry actually agrees with the declared `breakDir`. Mirrors the
 * production validator's logic in route-assignment-validate.ts.
 */
function assertSideMatches(template: RouteTemplate, dx: number, playerXNorm: number): void {
  const side: BreakDirection = template.constraints.side;
  // Carrier on left (norm < 0.5) → inside is +x; on right (>0.5) → -x.
  const insideSign = playerXNorm < 0.5 ? 1 : playerXNorm > 0.5 ? -1 : 0;

  if (side === "vertical") {
    expect(
      Math.abs(dx),
      `${template.name} declared vertical but ends ${dx.toFixed(2)} yds laterally`,
    ).toBeLessThanOrEqual(2.0); // slightly more permissive than validator's 1.5
    return;
  }

  if (insideSign === 0) return; // mid-field carrier — no enforcement

  if (side === "toward_qb") {
    // Final dx must be in the inside direction (or close to zero for
    // routes like Sit/Hitch that finish near the player's x).
    if (Math.abs(dx) > 1.0) {
      expect(
        Math.sign(dx),
        `${template.name} declared toward_qb (inside) but final dx=${dx.toFixed(2)} pushes outside`,
      ).toBe(insideSign);
    }
  } else if (side === "toward_sideline") {
    if (Math.abs(dx) > 1.0) {
      expect(
        Math.sign(dx),
        `${template.name} declared toward_sideline (outside) but final dx=${dx.toFixed(2)} pushes inside`,
      ).toBe(-insideSign);
    }
  }
}
