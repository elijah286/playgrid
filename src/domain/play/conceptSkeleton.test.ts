/**
 * Concept skeleton generator tests.
 *
 * Two layers of assertions:
 *   1. STRUCTURAL: every CONCEPT_CATALOG entry has a skeleton builder
 *      (so we can't ship a new concept without skeleton coverage).
 *   2. ROUND-TRIP: every generated skeleton SATISFIES its own concept
 *      via assertConcept. If the catalog tightens a concept (e.g. Mesh
 *      slot ranges shift), the skeleton must still pass — otherwise
 *      the skeleton is stale and Cal would author a play that fails
 *      its own concept validator.
 */

import { describe, expect, it } from "vitest";
import { generateConceptSkeleton } from "./conceptSkeleton";
import { CONCEPT_CATALOG, findConcept } from "./conceptCatalog";
import { assertConcept } from "./conceptMatch";
import { playSpecToCoachDiagram } from "./specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { validateOffensiveCoverage } from "@/lib/coach-ai/play-content-validate";
import { validateRouteAssignments } from "@/lib/coach-ai/route-assignment-validate";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

describe("generateConceptSkeleton — every catalog concept has a builder", () => {
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: builder exists and returns ok`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok, result.ok ? undefined : result.error).toBe(true);
    });
  }
});

describe("generateConceptSkeleton — every skeleton SATISFIES its own concept (round-trip)", () => {
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: skeleton spec passes assertConcept("${concept.name}")`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const matchResult = assertConcept(result.spec, concept.name);
      expect(
        matchResult.ok,
        matchResult.ok
          ? undefined
          : `Skeleton for "${concept.name}" failed its own concept validator: ${JSON.stringify(matchResult.violations)}`,
      ).toBe(true);
    });
  }
});

describe("generateConceptSkeleton — alias resolution", () => {
  it("resolves 'Sail' → Flood skeleton", () => {
    const result = generateConceptSkeleton("Sail", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.concept).toBe("Flood");
  });
  it("resolves 'Mesh Concept' → Mesh skeleton", () => {
    const result = generateConceptSkeleton("Mesh Concept", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.concept).toBe("Mesh");
  });
  it("rejects an unknown concept and lists available", () => {
    const result = generateConceptSkeleton("Made-Up Concept", { variant: "tackle_11" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.availableConcepts.length).toBeGreaterThan(0);
    expect(result.error).toContain("Unknown concept");
  });
});

describe("generateConceptSkeleton — strength side", () => {
  it("Flood Right: Z+S+B all on the right side", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cornerAssignment = result.spec.assignments.find(
      (a) => a.action.kind === "route" && a.action.family === "Corner",
    );
    expect(cornerAssignment?.player).toBe("Z");
  });
  it("Flood Left: X+H+B all on the left side", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cornerAssignment = result.spec.assignments.find(
      (a) => a.action.kind === "route" && a.action.family === "Corner",
    );
    expect(cornerAssignment?.player).toBe("X");
  });
});

describe("generateConceptSkeleton — Flood: slot is Out, RB flat goes to flood side", () => {
  // 2026-05-02 coach feedback regressions, pinned together because
  // they share a root cause (slot family + RB direction):
  //   1. Flood's slot used to be Curl 5; coach surfaced that real
  //      Flood is OUT at the second level (8yd). Pin Out + depth.
  //   2. Flood Left used to render B's flat going RIGHT because
  //      B's natural backfield x≈+2 in Spread Doubles. The skeleton
  //      now sets `direction: "left"` so the flat goes flood-side
  //      regardless of backfield position.

  it("slot runs an Out at the second level (depth 8yd)", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slotAssignment = result.spec.assignments.find(
      (a) => a.player === "S" && a.action.kind === "route",
    );
    expect(slotAssignment).toBeDefined();
    if (!slotAssignment || slotAssignment.action.kind !== "route") return;
    expect(slotAssignment.action.family).toBe("Out");
    expect(slotAssignment.action.depthYds).toBe(8);
  });

  it("Flood Left: RB's Flat carries direction='left' so it renders to the flood side", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bAssignment = result.spec.assignments.find(
      (a) => a.player === "B" && a.action.kind === "route",
    );
    expect(bAssignment).toBeDefined();
    if (!bAssignment || bAssignment.action.kind !== "route") return;
    expect(bAssignment.action.family).toBe("Flat");
    expect(bAssignment.action.direction).toBe("left");
  });

  it("Flood Right: RB's Flat carries direction='right'", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bAssignment = result.spec.assignments.find(
      (a) => a.player === "B" && a.action.kind === "route",
    );
    if (!bAssignment || bAssignment.action.kind !== "route") return;
    expect(bAssignment.action.direction).toBe("right");
  });
});

describe("generateConceptSkeleton — @B Flat depth clears the LOS for backfield carriers", () => {
  // Surfaced 2026-05-20: @B at y=-5 running a Flat at depth=2 puts the
  // catch point at y=-3, exactly at the Layer 4 backwards-route
  // threshold (-3). Any slight depth variation (Cal hand-authoring at
  // 1.5yd) tips below — the catch lands behind the LOS and the
  // forward-pass-legality check rejects. Bumped to 4yd in all
  // skeletons so the catch lands at y=-1, giving 2yd of margin.

  it.each([
    ["Curl-Flat", "right"],
    ["Smash", "right"],
    ["Stick", "right"],
    ["Snag", "right"],
    ["Four Verticals", undefined],
    ["Mesh", undefined],
    ["Drive", undefined],
    ["Levels", undefined],
    ["Y-Cross", undefined],
    ["Dagger", undefined],
    ["Flood", "right"],
  ])("%s: @B's Flat depth is ≥ 4yd so the catch clears the LOS", (concept, strength) => {
    const result = generateConceptSkeleton(concept, {
      variant: "tackle_11",
      strength: strength as "left" | "right" | undefined,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bAssignment = result.spec.assignments.find(
      (a) => a.player === "B" && a.action.kind === "route" && a.action.family === "Flat",
    );
    if (!bAssignment || bAssignment.action.kind !== "route") return;
    expect(bAssignment.action.depthYds).toBeGreaterThanOrEqual(4);
  });
});

describe("generateConceptSkeleton — Mesh: differentiated drag depths", () => {
  it("the two drags have different depthYds (one under, one over)", () => {
    const result = generateConceptSkeleton("Mesh", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const drags = result.spec.assignments.filter(
      (a) => a.action.kind === "route" && a.action.family === "Drag",
    );
    expect(drags).toHaveLength(2);
    const depths = drags.map((d) => (d.action.kind === "route" ? d.action.depthYds : undefined));
    expect(new Set(depths).size).toBe(2); // must be DIFFERENT depths
  });
});

// ── Mesh 5v5 crossing-pair correctness (audit finding #2, 2026-05-26) ──
// Coach feedback: "the mesh on a flag play is not a mesh — the running
// back should be meshing with one of the outside receivers." The prior
// 5v5 build used @C (center) as the over-drag, which violates the
// canonical convention: in 5v5 the center has no clean release angle
// from the snap point and can't cross the formation cleanly within
// the 7-second clock. The crossing pair should be the RB + an outside
// WR; the center plays a short underneath sit.
describe("generateConceptSkeleton — Mesh in flag_5v5 crossing pair", () => {
  it("the center (@C) does NOT run a drag — outside WR is the over-crosser", () => {
    const result = generateConceptSkeleton("Mesh", { variant: "flag_5v5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const center = result.spec.assignments.find((a) => a.player === "C");
    expect(
      center?.action.kind === "route" && center.action.family,
      "@C in 5v5 Mesh must NOT run a Drag — no clean release angle from snap point",
    ).not.toBe("Drag");
  });

  it("the two drag-runners are @Y (RB) + an outside WR (@X or @Z)", () => {
    const result = generateConceptSkeleton("Mesh", { variant: "flag_5v5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dragRunners = result.spec.assignments
      .filter((a) => a.action.kind === "route" && a.action.family === "Drag")
      .map((a) => a.player);
    expect(dragRunners).toHaveLength(2);
    expect(dragRunners).toContain("Y"); // RB always one of the crossers
    // The other crosser is an outside WR, not the center.
    const otherCrosser = dragRunners.find((p) => p !== "Y");
    expect(["X", "Z"]).toContain(otherCrosser);
  });
});

// ── QB Draw / Draw receivers run vertical clears (audit #4) ──
// Canonical: both Draw concepts need the receivers to pull LBs and
// safeties AWAY from the run lane. Hitches at 3-5yd keep defenders
// AT the LB level — exactly where the back is going. The play's own
// commonMistakes calls this out ("Receivers don't widen on their
// hitches; LBs hold the middle and the lane closes"). Fix: vertical
// clears (Go's + Seams) instead of hitches/drags.
describe("generateConceptSkeleton — QB Draw + Draw receivers", () => {
  it("QB Draw outside WRs run vertical clears (Go), not hitches", () => {
    const result = generateConceptSkeleton("QB Draw", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const x = result.spec.assignments.find((a) => a.player === "X");
    const z = result.spec.assignments.find((a) => a.player === "Z");
    expect(x?.action.kind === "route" && x.action.family).toBe("Go");
    expect(z?.action.kind === "route" && z.action.family).toBe("Go");
  });

  it("Draw (tackle) outside WRs run vertical clears, not Hitches/unspecified", () => {
    const result = generateConceptSkeleton("Draw", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const x = result.spec.assignments.find((a) => a.player === "X");
    expect(x?.action.kind).toBe("route");
    if (x?.action.kind !== "route") return;
    // Canonical Draw uses vertical clears (Go) to pull LBs away from
    // the lane. Sweep/Counter/Power use Hitch stalk-blocks.
    expect(x.action.family).toBe("Go");
  });

  it("Sweep (run-action) still uses Hitch stalk for receivers — only Draw flips to verticals", () => {
    const result = generateConceptSkeleton("Sweep", {
      variant: "flag_5v5",
      strength: "right",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // @X is not the carrier in 5v5 sweep — the carrier is @Y. So @X
    // should be a stalk-blocker (Hitch in flag).
    const x = result.spec.assignments.find((a) => a.player === "X");
    expect(x?.action.kind === "route" && x.action.family).toBe("Hitch");
  });
});

// ── Stick 5v5: strong-side outside WR clears the corner (audit #3) ──
// The prior 5v5 Stick had both outside WRs running Hitch @ 5, which
// left the corner camping at 5-8yd over the slot's stick route. The
// canonical Stick concept REQUIRES the strong-side outside WR (#1)
// to run a fade/go to pull the corner over the top — only then does
// the high-low on the flat defender actually work.
describe("generateConceptSkeleton — Stick in flag_5v5 strong-side clear", () => {
  it("strong-side outside WR runs a vertical clear (Go), not a Hitch", () => {
    const result = generateConceptSkeleton("Stick", {
      variant: "flag_5v5",
      strength: "right",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // For right-strength Stick the strong-side outside is @Z.
    const strongSide = result.spec.assignments.find((a) => a.player === "Z");
    expect(strongSide?.action.kind).toBe("route");
    if (strongSide?.action.kind !== "route") return;
    expect(
      strongSide.action.family,
      "Strong-side outside WR must clear the corner with Go/Fade — Hitch leaves the corner sitting on the stick",
    ).toBe("Go");
  });
});

describe("generateConceptSkeleton — flag_6v6 end-to-end", () => {
  // Smoke test that the new flag_6v6 variant composes legal plays for the
  // pass-concept skeletons (the ones a 6v6 coach would actually call). The
  // capability-gated concepts (QB Draw, Bubble RPO, Jet Reverse) live under
  // the advancedCapabilities opt-in and are excluded — 6v6 ships with empty
  // capabilities by default, same as 5v5.
  const PASS_CONCEPTS = CONCEPT_CATALOG.filter(
    (c) => !["QB Draw", "Bubble RPO", "Jet Reverse"].includes(c.name),
  );
  for (const concept of PASS_CONCEPTS) {
    it(`${concept.name} in flag_6v6 renders without overlap or formation_fallback`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "flag_6v6" });
      expect(result.ok, result.ok ? undefined : result.error).toBe(true);
      if (!result.ok) return;
      const { diagram, warnings } = playSpecToCoachDiagram(result.spec);
      expect(
        warnings.find((w) => w.code === "formation_fallback"),
        `${concept.name}/flag_6v6: synth didn't recognize "${result.spec.formation.name}"`,
      ).toBeUndefined();
      const fenceShape = {
        title: result.spec.title ?? result.concept,
        variant: "flag_6v6" as const,
        focus: "O" as const,
        ...diagram,
      };
      expect(
        () => coachDiagramToPlayDocument(fenceShape),
        `${concept.name}/flag_6v6: overlap resolver threw — geometry isn't safe`,
      ).not.toThrow();
    });
  }
});

describe("generateConceptSkeleton — variant-roster completeness", () => {
  // The Snag-in-flag_5v5 regression (2026-05-24): coach asked "Build a Snag
  // out of Bunch", Cal called compose_play, the tool returned a fence with
  // only 2 of 5 routes drawn because `buildSnag` hardcoded tackle/7v7 IDs
  // ("S", "H", "B") and the 5v5 synthesizer silently drops routes for
  // players that don't exist in the roster {Q, C, X, Y, Z}.
  //
  // Phase 2b's provenance gate DOES NOT catch this — the broken fence has
  // valid tool provenance; it's just wrong. The right enforcement layer is
  // the catalog itself: every skeleton must produce a complete play for
  // every variant it claims to support.
  //
  // The check uses `validateOffensiveCoverage` (the production chat-time +
  // save-time validator) directly so this test passes iff the validator
  // would pass. That matches the user's surface: if the validator flags
  // missing routes on @C/@Y, the play is broken; if it doesn't, the play
  // is good. Re-implementing the rule here would risk drift.
  //
  // Rosters per variant:
  //  - flag_5v5: {Q, C, X, Y, Z}  — C is eligible by default
  //  - flag_6v6: {Q, C, X, Y, Z, ?} (synth assigns the 6th)
  //  - flag_7v7: {Q, C, X, Y, Z, H, B} — C is snapper-only by default
  //  - tackle_11: full 11 incl. OL — linemen exempt
  // touch_7v7 is composition-identical to flag_7v7 (shared catalog,
  // shared roster, shared defensive templates) so the same cross-
  // variant gates apply. flag_4v4 has a 3-eligible roster that
  // requires concept-specific adaptation — tested separately below
  // with a filtered concept list.
  const variants = ["flag_5v5", "flag_6v6", "flag_7v7", "touch_7v7", "tackle_11"] as const;
  const PASS_CONCEPTS = CONCEPT_CATALOG.filter(
    (c) => !["QB Draw", "Bubble RPO", "Jet Reverse"].includes(c.name),
  );

  for (const concept of PASS_CONCEPTS) {
    for (const variant of variants) {
      it(`${concept.name} in ${variant} passes the offensive-coverage gate`, () => {
        const result = generateConceptSkeleton(concept.name, { variant });
        expect(result.ok, result.ok ? undefined : result.error).toBe(true);
        if (!result.ok) return;
        const { diagram } = playSpecToCoachDiagram(result.spec);
        // Shape the diagram the way the validator expects (it reads
        // variant off the diagram if not passed). Pass variant explicitly.
        const errors = validateOffensiveCoverage(
          diagram as CoachDiagram,
          variant,
          null, // playbook settings: use variant defaults
          result.spec.playType,
        );
        expect(
          errors,
          `${concept.name}/${variant} fails the offensive-coverage gate:\n  ${errors.join("\n  ")}\n` +
            `\nLikely the skeleton hardcodes tackle/7v7 IDs (S/H/B) that don't exist in this variant's roster. ` +
            `See buildFleaFlicker for the variant-aware pattern (Y + C in flag_5v5).`,
        ).toEqual([]);
      });
    }
  }
});

describe("generateConceptSkeleton — every skeleton passes the route-assignment validator", () => {
  // 2026-05-24 cross-variant audit. The companion test above
  // (offensive-coverage) checks that every player has SOME action;
  // this one checks that every action's geometry passes the
  // route-assignment validator's gates (depth caps, family
  // constraints, side direction, forward-pass legality). The two
  // together cover both failure classes that surfaced in production
  // (the Snag-in-5v5 roster bug AND the QB-carry / Seam-drift
  // catalog bugs).
  //
  // Uses the production `validateRouteAssignments` directly so the
  // test passes iff the validator would pass at chat-time + save-time.
  // touch_7v7 is composition-identical to flag_7v7 (shared catalog,
  // shared roster, shared defensive templates) so the same cross-
  // variant gates apply. flag_4v4 has a 3-eligible roster that
  // requires concept-specific adaptation — tested separately below
  // with a filtered concept list.
  const variants = ["flag_5v5", "flag_6v6", "flag_7v7", "touch_7v7", "tackle_11"] as const;
  const PASS_CONCEPTS = CONCEPT_CATALOG.filter(
    (c) => !["QB Draw", "Bubble RPO", "Jet Reverse"].includes(c.name),
  );

  for (const concept of PASS_CONCEPTS) {
    for (const variant of variants) {
      it(`${concept.name} in ${variant} passes route-assignment validation`, () => {
        const result = generateConceptSkeleton(concept.name, { variant });
        expect(result.ok, result.ok ? undefined : result.error).toBe(true);
        if (!result.ok) return;
        const { diagram } = playSpecToCoachDiagram(result.spec);
        const validation = validateRouteAssignments(diagram as CoachDiagram, {
          variant,
        });
        const errorMessages = validation.ok ? [] : validation.errors.map((e) => e.message);
        expect(
          errorMessages,
          `${concept.name}/${variant} fails route-assignment validation:\n  ${errorMessages.join("\n  ")}`,
        ).toEqual([]);
      });
    }
  }
});

describe("generateConceptSkeleton — flag_4v4 adapted concepts pass coverage + route-assignment validation", () => {
  // 4v4 has a 3-eligible roster {Q, X, Y, Z} — no @C / @S / @H / @B.
  // Concepts that hardcode tackle/7v7 IDs fall through to the else
  // branch and produce routes for players that don't exist, which the
  // synthesizer silently drops. This test pins down the concepts that
  // HAVE 4v4-specific skeleton branches and asserts they pass both
  // gates (offensive coverage + route-assignment validation).
  //
  // To add a new flag_4v4-adapted concept: append its name to
  // FLAG_4V4_ADAPTED_CONCEPTS and ensure the builder has a
  // `if (variant === "flag_4v4")` branch that uses flagFourRoutes().
  const FLAG_4V4_ADAPTED_CONCEPTS = [
    "Curl-Flat",
    "Slant-Flat",
    "Smash",
    "Stick",
    "Snag",
    "Four Verticals",
    "Mesh",
    "Flood",
    "Drive",
    "Levels",
  ] as const;

  for (const conceptName of FLAG_4V4_ADAPTED_CONCEPTS) {
    it(`${conceptName} in flag_4v4 passes offensive-coverage + route-assignment`, () => {
      const result = generateConceptSkeleton(conceptName, { variant: "flag_4v4" });
      expect(result.ok, result.ok ? undefined : result.error).toBe(true);
      if (!result.ok) return;
      const { diagram } = playSpecToCoachDiagram(result.spec);
      // Coverage gate.
      const coverageErrors = validateOffensiveCoverage(
        diagram as CoachDiagram,
        "flag_4v4",
        null,
        result.spec.playType,
      );
      expect(
        coverageErrors,
        `${conceptName}/flag_4v4 fails coverage:\n  ${coverageErrors.join("\n  ")}`,
      ).toEqual([]);
      // Route-assignment gate.
      const validation = validateRouteAssignments(diagram as CoachDiagram, {
        variant: "flag_4v4",
      });
      const errorMessages = validation.ok ? [] : validation.errors.map((e) => e.message);
      expect(
        errorMessages,
        `${conceptName}/flag_4v4 fails route-assignment:\n  ${errorMessages.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});

describe("generateConceptSkeleton — every skeleton survives the overlap resolver (real end-to-end check)", () => {
  // The unit-level "no overlapping (x, y)" check in the next describe
  // block isn't sufficient — the production overlap resolver uses a
  // normalized-distance THRESHOLD (≈ 0.0672), not exact equality. A
  // slot at x=6 next to RT at x=4 (different y) has unique (x, y) but
  // is still within the resolver's threshold and triggers the same
  // failure that surfaced 2026-05-02. This test runs the full
  // coachDiagramToPlayDocument pipeline (which is what the chat embed
  // uses) and asserts it doesn't throw the overlap-resolver error.
  for (const concept of CONCEPT_CATALOG) {
    const sides: Array<"left" | "right" | undefined> = ["left", "right", undefined];
    for (const strength of sides) {
      const label = strength ? `${concept.name} (${strength})` : concept.name;
      it(`${label} in tackle_11 passes the overlap resolver end-to-end`, () => {
        const result = generateConceptSkeleton(concept.name, { variant: "tackle_11", strength });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { diagram } = playSpecToCoachDiagram(result.spec);
        // Wrap in the chat-fence shape coachDiagramToPlayDocument expects.
        const fenceShape = {
          title: result.spec.title ?? result.concept,
          variant: "tackle_11" as const,
          focus: "O" as const,
          ...diagram,
        };
        expect(
          () => coachDiagramToPlayDocument(fenceShape),
          `${label}: overlap resolver threw — geometry isn't safe`,
        ).not.toThrow();
      });
    }
  }
});

describe("generateConceptSkeleton — Flood Right tackle_11 doesn't trigger the overlap resolver (S vs H regression)", () => {
  // Reproduces the exact scenario the coach hit 2026-05-02: a Flood
  // Right play in tackle_11 that failed with "Overlap resolver failed
  // to converge ... 'S' and 'H' overlap (Δ 3.56 yds)". Root cause was
  // the synthesizer placing the inner slot at x=4 (RT's column).
  // Now: with the synthesizer clamp (|x| >= 6 for slots), the rendered
  // diagram should have S and H at distinct, non-OL-overlapping
  // positions.
  it("rendered Flood Right (Spread Doubles): S and H end up on OPPOSITE sides at distinct, OL-clear positions", () => {
    // 2026-05-02: Flood now uses Spread Doubles (not Trips), so H ends
    // up on the LEFT (backside drag) and S on the RIGHT (strong-side
    // curl). The diagram is structurally clean: S and H are on
    // opposite sides → can't overlap each other; both clear of the OL.
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { diagram } = playSpecToCoachDiagram(result.spec);
    const s = diagram.players.find((p) => p.id === "S");
    const h = diagram.players.find((p) => p.id === "H");
    expect(s, "Flood Right: S not in rendered formation").toBeDefined();
    expect(h, "Flood Right: H not in rendered formation").toBeDefined();
    // Strong-side slot (S) on the right; backside slot (H) on the left.
    expect(s!.x).toBeGreaterThan(0);
    expect(h!.x).toBeLessThan(0);
    // Both clear of the OL row.
    expect(Math.abs(s!.x)).toBeGreaterThanOrEqual(7);
    expect(Math.abs(h!.x)).toBeGreaterThanOrEqual(7);
  });
});

describe("generateConceptSkeleton — every skeleton RENDERS without overlap or fallback (regression for S+H stacking)", () => {
  // Every skeleton must produce a CoachDiagram where (a) the synthesizer
  // recognized the formation (no formation_fallback warning), and (b) no
  // two offensive players occupy the same (x, y). This locks in the
  // "Cal hand-authored S+H at the same position" failure mode (2026-05-02)
  // — the skeleton tool now feeds Cal a rendered diagram, so as long as
  // every skeleton renders cleanly, that bug class is impossible.
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: renders to a CoachDiagram with NO overlapping players and NO formation_fallback`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { diagram, warnings } = playSpecToCoachDiagram(result.spec);
      expect(
        warnings.find((w) => w.code === "formation_fallback"),
        `${concept.name}: formation_fallback fired — synthesizer didn't recognize "${result.spec.formation.name}". Use a parsed name.`,
      ).toBeUndefined();
      // No two offensive players at exactly the same (x, y).
      const offense = diagram.players.filter((p) => p.team !== "D");
      const positions = new Set<string>();
      const collisions: string[] = [];
      for (const p of offense) {
        const key = `${p.x},${p.y}`;
        if (positions.has(key)) collisions.push(`@${p.id} at (${p.x}, ${p.y})`);
        positions.add(key);
      }
      expect(
        collisions,
        `${concept.name}: players overlap at the same (x, y): ${collisions.join(", ")}`,
      ).toEqual([]);
    });
  }
});

describe("generateConceptSkeleton — concept catalog smoke (every concept's skeleton is well-formed)", () => {
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: spec has a formation, a non-empty assignments list, and a notes string`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.spec.formation.name).toBeTruthy();
      expect(result.spec.assignments.length).toBeGreaterThan(0);
      expect(result.notes.length).toBeGreaterThan(20);
      // Concept reference round-trips through findConcept.
      expect(findConcept(result.concept)).not.toBeNull();
    });
  }
});

// Concept-specific pins for the designed-QB-run / RPO / reverse build.
// These are the litmus tests Cal must satisfy: build a QB run, build
// a multi-handoff reverse, build an RPO with read info. Each test
// validates the exact spec shape that downstream tooling (resolver,
// notes projector, renderer) expects.
describe("generateConceptSkeleton — QB Draw (designed QB run)", () => {
  it("emits a carry on the QB with runType 'draw'", () => {
    const result = generateConceptSkeleton("QB Draw", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const qbAssignment = result.spec.assignments.find((a) => a.player === "QB");
    expect(qbAssignment, "QB Draw must assign the QB the ballcarrier role").toBeDefined();
    expect(qbAssignment!.action.kind).toBe("carry");
    if (qbAssignment!.action.kind !== "carry") return;
    expect(qbAssignment!.action.runType).toBe("draw");
  });

  it("does NOT include a separate dropback assignment for the QB (they're the runner)", () => {
    const result = generateConceptSkeleton("QB Draw", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const qbAssignments = result.spec.assignments.filter((a) => a.player === "QB");
    expect(qbAssignments, "QB should have exactly one assignment").toHaveLength(1);
  });

  it("resolves the 'Quarterback Draw' alias to the same skeleton", () => {
    const r1 = generateConceptSkeleton("QB Draw", { variant: "tackle_11" });
    const r2 = generateConceptSkeleton("Quarterback Draw", { variant: "tackle_11" });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r2.concept).toBe(r1.concept);
  });
});

describe("generateConceptSkeleton — Bubble RPO", () => {
  it("emits an rpo_read on the QB with the right read shape", () => {
    const result = generateConceptSkeleton("Bubble RPO", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const qb = result.spec.assignments.find((a) => a.player === "QB");
    expect(qb?.action.kind).toBe("rpo_read");
    if (qb?.action.kind !== "rpo_read") return;
    expect(qb.action.giveTo).toBe("B");
    expect(qb.action.passTo).toBe("S"); // default strength=right
    expect(qb.action.pullIf).toBe("in");
    expect(qb.action.keyDefenderRole).toBe("playside_lb");
  });

  it("pairs the rpo_read with an Inside Zone carry on the back AND a Bubble route on the pass-side slot", () => {
    const result = generateConceptSkeleton("Bubble RPO", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = result.spec.assignments.find((a) => a.player === "B");
    expect(back?.action.kind).toBe("carry");
    if (back?.action.kind !== "carry") return;
    expect(back.action.runType).toBe("inside_zone");

    const slot = result.spec.assignments.find((a) => a.player === "S");
    expect(slot?.action.kind).toBe("route");
    if (slot?.action.kind !== "route") return;
    expect(slot.action.family).toBe("Bubble");
  });

  it("mirrors the bubble side when strength is 'left' (H runs the bubble instead of S)", () => {
    const result = generateConceptSkeleton("Bubble RPO", { variant: "tackle_11", strength: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const qb = result.spec.assignments.find((a) => a.player === "QB");
    if (qb?.action.kind !== "rpo_read") return;
    expect(qb.action.passTo).toBe("H");
    const h = result.spec.assignments.find((a) => a.player === "H");
    if (h?.action.kind !== "route") return;
    expect(h.action.family).toBe("Bubble");
  });

  it("notes include the read key explanation (the litmus test for 'tells the coach what to look for')", () => {
    const result = generateConceptSkeleton("Bubble RPO", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes.toLowerCase()).toContain("playside olb");
    expect(result.notes.toLowerCase()).toMatch(/pull and throw|give/);
  });
});

describe("generateConceptSkeleton — Jet Reverse (multi-handoff)", () => {
  it("emits a ballPath with exactly 2 handoff steps (QB → B → reverse-carrier)", () => {
    const result = generateConceptSkeleton("Jet Reverse", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.ballPath).toBeDefined();
    expect(result.spec.ballPath!.length).toBe(2);
    expect(result.spec.ballPath![0].from).toBe("QB");
    expect(result.spec.ballPath![0].to).toBe("B");
    expect(result.spec.ballPath![1].from).toBe("B");
    expect(result.spec.ballPath![1].to).toBe("X"); // default strength=right → reverse comes from weak side (left WR = X)
  });

  it("each ballPath handler has a corresponding carry assignment with waypoints", () => {
    const result = generateConceptSkeleton("Jet Reverse", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // B (intermediate carrier) and X (reverse carrier) both need carries.
    for (const id of ["B", "X"]) {
      const a = result.spec.assignments.find((p) => p.player === id);
      expect(a?.action.kind, `@${id} should be a ballcarrier in the reverse`).toBe("carry");
      if (a?.action.kind !== "carry") continue;
      expect(a.action.waypoints, `@${id} carry should have explicit waypoints`).toBeDefined();
      expect(a.action.waypoints!.length).toBeGreaterThan(0);
    }
  });

  it("ballPath continuity holds: step 2's `from` matches step 1's `to`", () => {
    // The play-tools resolver enforces this; the skeleton must satisfy it.
    const result = generateConceptSkeleton("Jet Reverse", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.ballPath![1].from).toBe(result.spec.ballPath![0].to);
  });

  it("mirrors the reverse direction when strength is 'left' (reverse carrier is Z instead of X)", () => {
    const result = generateConceptSkeleton("Jet Reverse", { variant: "tackle_11", strength: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.ballPath![1].to).toBe("Z");
  });
});

// End-to-end: each new skeleton must clear the play-tools resolver
// gates (schema, capability when enabled, ball-flow semantics,
// defender validation) and produce a renderable diagram. This is the
// real "Cal can save it" test.
describe("generateConceptSkeleton — new concepts pass the playbook-rule + ball-flow gates", () => {
  it("QB Draw passes validatePlaySpecVsRules + validatePlaySpecBallFlow when designed_qb_run is enabled", async () => {
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const { validatePlaySpecBallFlow } = await import("./specSemantics");
    const result = generateConceptSkeleton("QB Draw", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validatePlaySpecVsRules(result.spec, ["designed_qb_run"]).ok).toBe(true);
    expect(validatePlaySpecBallFlow(result.spec).ok).toBe(true);
  });

  it("QB Draw is REJECTED by validatePlaySpecVsRules when designed_qb_run is NOT enabled", async () => {
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const result = generateConceptSkeleton("QB Draw", { variant: "tackle_11" });
    if (!result.ok) return;
    const ruleCheck = validatePlaySpecVsRules(result.spec, []);
    expect(ruleCheck.ok).toBe(false);
    if (ruleCheck.ok) return;
    expect(ruleCheck.violations.some((v) => v.capability === "designed_qb_run")).toBe(true);
  });

  it("Bubble RPO passes both gates when rpo_read is enabled", async () => {
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const { validatePlaySpecBallFlow } = await import("./specSemantics");
    const result = generateConceptSkeleton("Bubble RPO", { variant: "tackle_11" });
    if (!result.ok) return;
    expect(validatePlaySpecVsRules(result.spec, ["rpo_read"]).ok).toBe(true);
    expect(validatePlaySpecBallFlow(result.spec).ok).toBe(true);
  });

  it("Jet Reverse passes both gates when handoff_chain is enabled (ballPath continuity holds + rules match)", async () => {
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const { validatePlaySpecBallFlow } = await import("./specSemantics");
    const result = generateConceptSkeleton("Jet Reverse", { variant: "tackle_11" });
    if (!result.ok) return;
    expect(validatePlaySpecVsRules(result.spec, ["handoff_chain"]).ok).toBe(true);
    expect(validatePlaySpecBallFlow(result.spec).ok).toBe(true);
  });
});

// ── Run concept skeletons (Sweep / Dive / Counter / Draw) ───────────────
// 2026-05-13: a coach surfaced "Flea Flicker — X Deep" where Z was given
// a downfield route instead of a handoff (root cause: no trick-play
// concept existed, so Cal freelanced). Diagnosis also showed the run
// game had only QB Draw + Jet Reverse — no plain handoff-to-back
// concepts. Closing both gaps: add Sweep/Dive/Counter/Draw as
// catalog concepts so Cal composes them through the skeleton path
// (Rule 8) instead of hand-authoring waypoints.
describe.each([
  { name: "Sweep",   runType: "sweep"        },
  { name: "Dive",    runType: "inside_zone"  },
  { name: "Counter", runType: "counter"      },
  { name: "Draw",    runType: "draw"         },
])("generateConceptSkeleton — $name (single handoff to RB)", ({ name, runType }) => {
  it(`emits a single-step ballPath @QB → @B`, () => {
    const result = generateConceptSkeleton(name, { variant: "tackle_11" });
    expect(result.ok, result.ok ? undefined : (result as { error: string }).error).toBe(true);
    if (!result.ok) return;
    expect(result.spec.ballPath).toBeDefined();
    expect(result.spec.ballPath!.length).toBe(1);
    expect(result.spec.ballPath![0].from).toBe("QB");
    expect(result.spec.ballPath![0].to).toBe("B");
  });

  it(`puts a carry on @B with runType "${runType}" and explicit waypoints`, () => {
    const result = generateConceptSkeleton(name, { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = result.spec.assignments.find((a) => a.player === "B");
    expect(back?.action.kind, `@B should be the ballcarrier on ${name}`).toBe("carry");
    if (back?.action.kind !== "carry") return;
    expect(back.action.runType).toBe(runType);
    expect(back.action.waypoints, `@B's carry should have explicit waypoints showing the run path`).toBeDefined();
    expect(back.action.waypoints!.length).toBeGreaterThan(0);
  });

  it(`gives @QB a carry with explicit waypoints showing the handoff mesh (no runType, so designed_qb_run is NOT required)`, async () => {
    // The user surfaced 2026-05-13 that QB movement is never visible on
    // ANY play. For run plays, the QB MUST show motion to the mesh
    // point so coaches can teach the footwork. Modeling that as a
    // `kind: carry` with explicit waypoints and NO runType — the
    // designed_qb_run capability is keyed on runType being a
    // designed-run type, so omitting runType keeps the capability gate
    // off (the back's runType already triggers handoff_chain via ballPath).
    const result = generateConceptSkeleton(name, { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const qb = result.spec.assignments.find((a) => a.player === "QB");
    expect(qb?.action.kind, `@QB should show physical movement on a ${name} (mesh footwork)`).toBe("carry");
    if (qb?.action.kind !== "carry") return;
    expect(qb.action.runType, "@QB carry must NOT have a designed runType (capability gate)").toBeUndefined();
    expect(qb.action.waypoints, "@QB's path to the mesh must be explicit").toBeDefined();
    expect(qb.action.waypoints!.length).toBeGreaterThan(0);

    // And: the capability validator must NOT flag designed_qb_run.
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const ruleCheck = validatePlaySpecVsRules(result.spec, ["handoff_chain"]);
    expect(
      ruleCheck.ok,
      ruleCheck.ok ? undefined : `${name}: capability violations: ${JSON.stringify((ruleCheck as { violations: unknown[] }).violations)}`,
    ).toBe(true);
  });

  it(`passes both gates when handoff_chain is enabled`, async () => {
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const { validatePlaySpecBallFlow } = await import("./specSemantics");
    const result = generateConceptSkeleton(name, { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validatePlaySpecVsRules(result.spec, ["handoff_chain"]).ok).toBe(true);
    expect(validatePlaySpecBallFlow(result.spec).ok).toBe(true);
  });
});

// ── Sweep carry-path geometry regression (audit finding #1, 2026-05-26) ──
// A coach surfaced "your sweep looks like the back is running up the
// middle." Root cause: the original path `[mesh, (6,-2), (10,6)]` was
// a smooth diagonal — the back gained yards upfield AND laterally on
// the same legs, with no truly-lateral segment. Canonical Sweep is
// LATERAL FIRST (press the edge with parallel-to-LOS movement), then
// ONE decisive cut upfield once the lane opens.
//
// This regression locks the corrected J-shape geometry. If a future
// edit reverts to the diagonal, this test fails.
describe("generateConceptSkeleton — Sweep carry path geometry", () => {
  it("RB's path is lateral-first then cuts upfield (J-shape, not diagonal)", () => {
    const result = generateConceptSkeleton("Sweep", {
      variant: "tackle_11",
      strength: "right",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = result.spec.assignments.find((a) => a.player === "B");
    expect(back?.action.kind).toBe("carry");
    if (back?.action.kind !== "carry") return;
    const wp = back.action.waypoints;
    expect(wp).toBeDefined();
    if (!wp) return;
    expect(wp.length).toBeGreaterThanOrEqual(4); // mesh + ≥3 path waypoints

    // The defining property of the corrected geometry: between the
    // mesh and the cut-up point, lateral progress must exceed
    // upfield progress. The "lateral-first" portion (mesh → second-
    // to-last waypoint) should be ~80%+ lateral movement.
    const mesh = wp[0];
    const beforeCut = wp[wp.length - 2];
    const lateralBeforeCut = Math.abs(beforeCut[0] - mesh[0]);
    const upfieldBeforeCut = Math.abs(beforeCut[1] - mesh[1]);
    expect(
      lateralBeforeCut,
      `Lateral progress before the cut (${lateralBeforeCut}yd) must dominate upfield progress (${upfieldBeforeCut}yd) — Sweep is lateral first, then up`,
    ).toBeGreaterThan(upfieldBeforeCut);

    // The cut-up leg (second-to-last → last waypoint) should be the
    // OPPOSITE: dominantly upfield, minimal lateral.
    const final = wp[wp.length - 1];
    const lateralOnCut = Math.abs(final[0] - beforeCut[0]);
    const upfieldOnCut = Math.abs(final[1] - beforeCut[1]);
    expect(
      upfieldOnCut,
      `The cut-upfield leg (lateral ${lateralOnCut}yd, upfield ${upfieldOnCut}yd) must be dominantly vertical`,
    ).toBeGreaterThan(lateralOnCut);
  });

  it("works for left-strength too (mirrored geometry)", () => {
    const result = generateConceptSkeleton("Sweep", {
      variant: "tackle_11",
      strength: "left",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = result.spec.assignments.find((a) => a.player === "B");
    if (back?.action.kind !== "carry") return;
    // Left strength → all x-coordinates should be negative (heading
    // to the left sideline).
    const wp = back.action.waypoints ?? [];
    const lateralEnds = wp.slice(1).map((p) => p[0]);
    expect(lateralEnds.every((x) => x <= 0)).toBe(true);
  });
});

// ── Flea Flicker (trick play: handoff out + lateral back + deep pass) ───
// The bug that prompted this build: Cal generated a "Flea Flicker — X
// Deep" where Z ran a downfield route instead of taking a handoff.
// Root cause: no Flea Flicker concept existed, so Cal freelanced
// without the catalog-driven skeleton. With this concept in the
// catalog, Cal can ONLY compose a flea flicker through compose_play
// (per Rule 8), and the skeleton produces the canonical structure:
//   1. Snap to QB
//   2. QB hands to ballCarrier (Z by default) behind the LOS
//   3. ballCarrier runs toward the LOS as if rushing
//   4. ballCarrier pitches/laterals the ball BACK to QB behind the LOS
//   5. QB throws deep to a clear-out receiver
describe("generateConceptSkeleton — Flea Flicker (trick play, ball returns to passer)", () => {
  it("emits a 2-step ballPath where the ball returns to the QB", () => {
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok, result.ok ? undefined : (result as { error: string }).error).toBe(true);
    if (!result.ok) return;
    expect(result.spec.ballPath).toBeDefined();
    expect(result.spec.ballPath!.length).toBe(2);
    expect(result.spec.ballPath![0].from).toBe("QB");
    expect(result.spec.ballPath![1].to).toBe("QB");
    // Continuity: step 2's `from` matches step 1's `to`.
    expect(result.spec.ballPath![1].from).toBe(result.spec.ballPath![0].to);
  });

  it("both mesh points are behind the LOS (atPoint.y < 0)", () => {
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const step of result.spec.ballPath!) {
      expect(step.atPoint, "every flea-flicker exchange needs an explicit mesh point").toBeDefined();
      expect(
        step.atPoint![1],
        `${step.from}→${step.to} mesh must be behind the LOS (y<0) — a forward lateral is a fumble`,
      ).toBeLessThan(0);
    }
  });

  it("the ball carrier (default: Z) has a carry with waypoints tracing handoff → toward LOS → pitch-back", () => {
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const carrierId = result.spec.ballPath![0].to;
    const carrier = result.spec.assignments.find((a) => a.player === carrierId);
    expect(carrier?.action.kind, `@${carrierId} must be the ballcarrier`).toBe("carry");
    if (carrier?.action.kind !== "carry") return;
    expect(carrier.action.waypoints).toBeDefined();
    expect(carrier.action.waypoints!.length).toBeGreaterThanOrEqual(2);
    // Ball carrier must NOT have a downfield route assignment — the
    // exact bug the user reported was Z running a downfield route
    // instead of taking the handoff. Defense in depth: if a flea
    // flicker ever surfaces with the carrier on a route, this fails.
    const carrierRoute = result.spec.assignments.filter(
      (a) => a.player === carrierId && a.action.kind === "route",
    );
    expect(
      carrierRoute,
      `@${carrierId} is the ballcarrier on the flea flicker — must NOT also have a route assignment (that was the original bug)`,
    ).toHaveLength(0);
  });

  it("@QB has a carry with explicit waypoints showing mesh + return (the visible QB movement)", () => {
    // User's #3 directive: QB movement is required when the play
    // requires it. Flea flicker explicitly does — the QB has to step
    // to the mesh, retreat, then catch the lateral.
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const qb = result.spec.assignments.find((a) => a.player === "QB");
    expect(qb?.action.kind).toBe("carry");
    if (qb?.action.kind !== "carry") return;
    expect(qb.action.runType, "@QB carry on flea flicker must NOT have a designed runType").toBeUndefined();
    expect(qb.action.waypoints).toBeDefined();
    expect(qb.action.waypoints!.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least one deep clear-out route (the actual target of the trick play)", () => {
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const deepRoutes = result.spec.assignments.filter(
      (a) =>
        a.action.kind === "route" &&
        typeof a.action.depthYds === "number" &&
        a.action.depthYds >= 15,
    );
    expect(
      deepRoutes.length,
      "flea flicker must have at least one deep route (≥15yd) — the whole point is the deep shot off the run fake",
    ).toBeGreaterThanOrEqual(1);
  });

  it("supports a ballCarrier variant option ('Y' or 'RB' as the flicker carrier)", () => {
    // Variants requested 2026-05-13. The canonical version uses Z, but
    // a coach should be able to ask "flea flicker with Y" or with the
    // back as the flicker handler.
    const yResult = generateConceptSkeleton("Flea Flicker", {
      variant: "tackle_11",
      ballCarrier: "Y",
    });
    expect(yResult.ok, yResult.ok ? undefined : (yResult as { error: string }).error).toBe(true);
    if (!yResult.ok) return;
    expect(yResult.spec.ballPath![0].to).toBe("Y");
    expect(yResult.spec.ballPath![1].from).toBe("Y");

    const bResult = generateConceptSkeleton("Flea Flicker", {
      variant: "tackle_11",
      ballCarrier: "B",
    });
    expect(bResult.ok).toBe(true);
    if (!bResult.ok) return;
    expect(bResult.spec.ballPath![0].to).toBe("B");
  });

  it("passes both validator gates when handoff_chain is enabled", async () => {
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const { validatePlaySpecBallFlow } = await import("./specSemantics");
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validatePlaySpecVsRules(result.spec, ["handoff_chain"]).ok).toBe(true);
    expect(validatePlaySpecBallFlow(result.spec).ok).toBe(true);
  });

  it("is REJECTED when handoff_chain is NOT enabled (e.g. default 5v5 flag playbook)", async () => {
    const { validatePlaySpecVsRules } = await import("@/domain/playbook/playSpecRules");
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    if (!result.ok) return;
    const ruleCheck = validatePlaySpecVsRules(result.spec, []);
    expect(ruleCheck.ok).toBe(false);
    if (ruleCheck.ok) return;
    expect(ruleCheck.violations.some((v) => v.capability === "handoff_chain")).toBe(true);
  });

  it("notes describe the run-fake-then-pitch-back-then-deep-pass sequence", () => {
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const n = result.notes.toLowerCase();
    expect(n).toMatch(/pitch|lateral|flicker/);
    expect(n).toMatch(/deep|downfield|vertical/);
  });

  // 2026-05-13 regression — coach surfaced a 5v5 Flea Flicker rendered
  // with NO routes for @Y or @C. Root cause: skeleton hard-coded H/S
  // slot ids that don't exist in 5v5 (synth remaps to Y). The 5v5
  // skeleton now routes the canonical roster directly.
  it("in flag_5v5, every roster player ({Q,C,X,Y,Z}) ends up with an assignment that renders", () => {
    const result = generateConceptSkeleton("Flea Flicker", { variant: "flag_5v5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const assignedPlayers = new Set(result.spec.assignments.map((a) => a.player));
    // Carrier Z + QB are explicit carries. X is the deep target. Y
    // and C must each get a non-unspecified assignment (drag), or
    // the diagram renders with idle players.
    for (const id of ["Y", "C"]) {
      const a = result.spec.assignments.find((x) => x.player === id);
      expect(a, `@${id} must have an assignment in 5v5 Flea Flicker — without one, the diagram leaves them idle`).toBeDefined();
      if (!a) continue;
      expect(a.action.kind, `@${id} should run a route (Drag) in 5v5 Flea Flicker, not be unspecified`).toBe("route");
    }
    // Sanity check: no H / S / B references leaking through (those
    // were the broken ids the bug uncovered).
    expect(assignedPlayers.has("H")).toBe(false);
    expect(assignedPlayers.has("S")).toBe(false);
    expect(assignedPlayers.has("B")).toBe(false);
  });

  it("in flag_5v5, the rendered diagram draws routes for every non-carrier player", () => {
    // End-to-end: after rendering, every player that isn't the
    // carrier (Z) or the QB carry should have a visible route.
    const result = generateConceptSkeleton("Flea Flicker", { variant: "flag_5v5" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { diagram } = playSpecToCoachDiagram(result.spec);
    const playerIds = new Set(diagram.players.filter((p) => p.team !== "D").map((p) => p.id));
    // Drop QB (its movement is the carry) and the carrier (Z).
    const idle = [];
    for (const id of playerIds) {
      if (id === "QB" || id === "Q" || id === "Z") continue;
      const hasRoute = (diagram.routes ?? []).some((r) => r.from === id);
      if (!hasRoute) idle.push(id);
    }
    expect(idle, `flag_5v5 Flea Flicker rendered with idle players (no route): ${idle.join(", ")}`).toEqual([]);
  });
});

// ── Renderer regression: redundant handoff arrows (2026-05-13) ──────────
// User surfaced two arrowheads on @QB in a Flea Flicker — the carry
// path's arrow AND the ballPath handoff indicator arrow at mesh1.
// Visually reads as "QB has two routes" when it should read as "QB
// has one path that includes the mesh." The renderer now suppresses
// the indicator arrow when the giver's carry path already passes
// through the mesh point.
describe("playSpecToCoachDiagram — redundant handoff arrows are suppressed when the giver has a carry path through the mesh", () => {
  it("Flea Flicker: QB has exactly ONE outgoing route (the carry), not the carry PLUS a handoff arrow", () => {
    const result = generateConceptSkeleton("Flea Flicker", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { diagram } = playSpecToCoachDiagram(result.spec);
    const qbRoutes = (diagram.routes ?? []).filter((r) => r.from === "QB");
    expect(
      qbRoutes,
      `QB should have exactly one route (the carry path); the handoff arrow at the mesh is redundant when the QB's path already passes through it. Got ${qbRoutes.length} routes: ${qbRoutes.map((r) => r.route_kind ?? "carry").join(", ")}`,
    ).toHaveLength(1);
    // And it should be the carry, not the handoff arrow.
    expect(qbRoutes[0].route_kind).not.toBe("handoff");
  });

  it("Jet Reverse: QB has the handoff arrow (no carry, so the arrow is the only QB indicator)", () => {
    // Inverse of the above — Jet Reverse's QB has kind:"block", so
    // the handoff arrow IS the QB's only diagram element. Locks in
    // that the new "skip when giver has carry" rule doesn't
    // accidentally drop arrows from static givers.
    const result = generateConceptSkeleton("Jet Reverse", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { diagram } = playSpecToCoachDiagram(result.spec);
    const qbHandoffArrows = (diagram.routes ?? []).filter(
      (r) => r.from === "QB" && r.route_kind === "handoff",
    );
    expect(qbHandoffArrows.length).toBeGreaterThan(0);
  });
});

// ── Power concept (2026-05-20) ──────────────────────────────────────────
// Coach surfaced a Power play where Cal hand-authored the diagram with
// `from: "FB"` even though the tackle_11 formation had no FB. Root cause:
// Power wasn't in the catalog. compose_play({ concept: "Power" }) must
// succeed and emit a fence whose routes only reference players that
// actually exist in the formation — so a coach asking "build me a Power
// play" doesn't trigger the freelance path.
describe("Power concept — composable in tackle_11 (regression 2026-05-20)", () => {
  it("compose_play(\"Power\") succeeds in tackle_11", () => {
    const result = generateConceptSkeleton("Power", { variant: "tackle_11" });
    expect(result.ok, result.ok ? undefined : result.error).toBe(true);
    if (!result.ok) return;
    expect(result.concept).toBe("Power");
  });

  it("Power's emitted diagram has zero orphan routes (every route's carrier exists in players[])", () => {
    const result = generateConceptSkeleton("Power", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { diagram } = playSpecToCoachDiagram(result.spec);
    const playerIds = new Set(diagram.players.map((p) => p.id));
    const orphans = (diagram.routes ?? []).filter((r) => !playerIds.has(r.from));
    expect(
      orphans,
      `Power skeleton emitted orphan routes: ${orphans.map((r) => r.from).join(", ")}. ` +
        `Every route's @from must be a player in the formation.`,
    ).toHaveLength(0);
  });

  it("Power resolves aliases (Power O, Strong Power, Down G)", () => {
    for (const alias of ["Power O", "Strong Power", "Down G"]) {
      const result = generateConceptSkeleton(alias, { variant: "tackle_11" });
      expect(result.ok, `alias "${alias}" should resolve to Power`).toBe(true);
      if (!result.ok) return;
      expect(result.concept).toBe("Power");
    }
  });

  it("Power's back gets runType: 'power' (matcher distinguishes it from Dive)", () => {
    const result = generateConceptSkeleton("Power", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const backCarry = result.spec.assignments.find(
      (a) => a.player === "B" && a.action.kind === "carry",
    );
    expect(backCarry).toBeDefined();
    if (backCarry?.action.kind !== "carry") return;
    expect(backCarry.action.runType).toBe("power");
  });
});
