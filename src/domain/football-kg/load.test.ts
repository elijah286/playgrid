/**
 * Tests for the football-kg schemas, loader, and cross-reference validator.
 *
 * Phase 1a contract: schemas accept valid examples, reject malformed ones;
 * cross-ref validator catches every class of dangling reference. The
 * EMPTY_KG passes validation (trivially). Each test below uses a small
 * "fixture KG" — a hand-built KG with 1-2 entries per family — to exercise
 * a specific validation path.
 *
 * Phase 1b will reuse the same validator on the migrated catalog; if
 * any of the 20+27+22+18 migrated entries trip a cross-ref, this test
 * suite is what catches it.
 */

import { describe, expect, it } from "vitest";
import { ConceptDefZ, type ConceptDef } from "./schemas/ConceptDef";
import { FormationDefZ, type FormationDef } from "./schemas/FormationDef";
import { RouteDefZ, type RouteDef } from "./schemas/RouteDef";
import { SchemeDefZ, type SchemeDef } from "./schemas/SchemeDef";
import { ReactorPatternDefZ, type ReactorPatternDef } from "./schemas/ReactorPatternDef";
import { DrillDefZ, type DrillDef } from "./schemas/DrillDef";
import { EMPTY_KG, type FootballKG, validateKG, findConcept, findFormation, findRoute, findScheme, findReactorPattern } from "./load";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const fixtureRoute: RouteDef = {
  id: "drag",
  name: "Drag",
  family: "route",
  variants: ["flag_5v5", "flag_7v7", "tackle_11"],
  description: "Shallow crossing route across the field at 1-5 yards.",
  body: "The drag is a horizontal route that crosses the field at 1-5 yards deep. Used as a man-coverage answer and as a hot route vs blitz. Receiver runs flat (no vertical climb) and looks for the ball over their inside shoulder. Common pairings: mesh (two drags crossing), drive (drag + dig combo), and quick-game (drag as a hot vs man press).",
  points: [{ x: 0, y: 0 }, { x: -0.20, y: 0.10 }],
  shapes: ["straight"],
  directional: true,
  breakStyle: "none",
  breakDir: "toward_qb",
  constraints: { depthRangeYds: { min: 1, max: 5 }, side: "toward_qb" },
  kbSubtopic: "route_drag",
};

const fixtureFormation: FormationDef = {
  id: "doubles",
  name: "Doubles (2x2)",
  family: "formation",
  variants: ["flag_5v5", "flag_7v7", "tackle_11"],
  description: "Balanced 2x2 spread set — two receivers each side of the center.",
  body: "Doubles places two receivers on each side of the center, with the QB in shotgun and (in variants with backs) a single back beside the QB. Balanced look — defense can't cheat coverage to one side. Foundation set for most spread offenses. Pairs with mesh, smash, four-verts, and bubble RPOs.",
  spec: {
    qb: "shotgun",
    backs: "single",
    receivers: { left: 2, right: 2, te: 0 },
  },
  tags: ["spread", "balanced", "no-trips"],
};

const fixtureScheme: SchemeDef = {
  id: "f5-cover-1",
  name: "5v5 Man Cover 1",
  family: "scheme",
  variants: ["flag_5v5"],
  description: "5v5 man coverage with a single deep safety — four defenders in man, one over the top.",
  body: "Four defenders lock the four skill receivers in man (CB on X, NB on the slots, CB on Z), with FS at 12 yds as the single high safety. Man-on-man with help over the top — the classic answer to quick-game offenses that rely on horizontal stress.",
  front: "5v5 Man",
  coverage: "Cover 1",
  manCoverage: true,
  defenders: [
    { id: "CB", x: -8, y: 5, assignment: { kind: "man", target: "X" } },
    { id: "NB", x: -3, y: 5, assignment: { kind: "man", target: "H" } },
    { id: "NB", x: 3, y: 5, assignment: { kind: "man", target: "S" } },
    { id: "CB", x: 8, y: 5, assignment: { kind: "man", target: "Z" } },
    { id: "FS", x: 0, y: 12, assignment: { kind: "zone", zoneId: "deep_middle" } },
  ],
  zones: [
    { id: "deep_middle", kind: "ellipse", center: [0, 17], size: [20, 16], label: "Deep middle (FS)" },
  ],
};

const fixtureConcept: ConceptDef = {
  id: "mesh",
  name: "Mesh",
  family: "concept",
  variants: ["flag_5v5", "flag_7v7", "tackle_11"],
  description: "Two crossing drag routes underneath at staggered depths — the classic man-beater.",
  body: "Mesh sends two receivers on shallow drags that cross at the middle of the field at staggered depths (2 yds and 6 yds). The crossing action creates a natural pick / rub vs man coverage, freeing one of the drags. Vs zone the drags settle into hook windows. Pairs the under-drag (faster receiver) with the over-drag (slower) and a clear-out vertical to keep deep defenders honest.",
  aliases: ["Mesh Concept", "Crossers"],
  complexity: "intermediate",
  defaultFormation: { id: "doubles", strength: "right" },
  altFormations: [
    { id: "doubles", note: "Canonical — balanced look, natural mesh angles" },
  ],
  assignments: [
    { player: "X", action: { kind: "route", routeId: "drag", depthYds: 2 } },
    { player: "Z", action: { kind: "route", routeId: "drag", depthYds: 6 } },
  ],
  reads: [
    { progression: 1, player: "X", coverage: "vs man", window: "underneath at 2yd, ball over inside shoulder" },
    { progression: 2, player: "Z", coverage: "vs man", window: "underneath at 6yd, settling in zone if soft" },
  ],
  whenToUse: "Vs man coverage, especially press man. Vs zone the drags settle into hook windows.",
  commonMistakes: [
    "Both drags at the same depth — destroys the cross",
    "Hand-authoring the routes instead of using compose_play — drift from canonical depths",
  ],
};

const fixtureReactorPattern: ReactorPatternDef = {
  id: "f5-cover1-vs-mesh",
  name: "F5 Cover 1 vs Mesh",
  family: "reactor-pattern",
  variant: "flag_5v5",
  variants: ["flag_5v5"],
  description: "Cover 1's reaction to the Mesh concept in flag_5v5.",
  body: "Defenders stay in man through the cross — no switch. Each NB trails their man across the mesh, communicating the rub at the LOS.",
  schemeId: "f5-cover-1",
  conceptId: "mesh",
  reactors: [
    { defender: "NB", trigger: "X", behavior: "wall_off", cue: "Trails @X across the mesh — no clean break from the rub." },
    { defender: "NB2", trigger: "Z", behavior: "wall_off", cue: "Trails @Z across the mesh — communicate switch only if compromised." },
  ],
};

const fixtureDrill: DrillDef = {
  id: "drag-rep",
  name: "Drag Route Reps",
  family: "drill",
  variants: ["flag_5v5", "flag_7v7"],
  description: "Receivers run shallow drags vs air, focusing on flat angle and looking over the inside shoulder.",
  body: "Set up 2 cones 10yd apart at 2yd depth. Receivers start at the cone, run a flat drag to the second cone, turn head to look for the ball over the inside shoulder. Coach throws on the break. Reps both sides. Catch with hands, not body. Focus on staying flat — no drift upfield. 6-8 reps per receiver.",
  focus: "route-precision",
  durationMinutes: 8,
  playersNeeded: { min: 2, max: 8 },
  equipment: ["cones", "footballs"],
  procedure: "1. Set 2 cones at 2yd depth, 10yd apart laterally. 2. Receiver starts at one cone. 3. On coach's go, sprint flat to the second cone. 4. Coach throws on the break. 5. Catch with hands, look over inside shoulder.",
  ageRange: { min: 7, max: 14 },
};

/* ------------------------------------------------------------------ */
/*  Schema tests — each family accepts valid + rejects invalid         */
/* ------------------------------------------------------------------ */

describe("RouteDefZ — schema validation", () => {
  it("accepts a canonical route", () => {
    expect(RouteDefZ.safeParse(fixtureRoute).success).toBe(true);
  });

  it("rejects a non-kebab-case id", () => {
    const bad = { ...fixtureRoute, id: "Drag" };
    expect(RouteDefZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a points array with fewer than 2 waypoints", () => {
    const bad = { ...fixtureRoute, points: [{ x: 0, y: 0 }] };
    expect(RouteDefZ.safeParse(bad).success).toBe(false);
  });

  it("rejects constraints.depthRangeYds with max < min", () => {
    const bad = { ...fixtureRoute, constraints: { depthRangeYds: { min: 5, max: 1 }, side: "toward_qb" as const } };
    expect(RouteDefZ.safeParse(bad).success).toBe(false);
  });

  it("rejects shapes whose length doesn't match points.length - 1", () => {
    const bad = { ...fixtureRoute, shapes: ["straight" as const, "straight" as const] };
    expect(RouteDefZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a kbSubtopic that doesn't start with 'route_'", () => {
    const bad = { ...fixtureRoute, kbSubtopic: "drag" };
    expect(RouteDefZ.safeParse(bad).success).toBe(false);
  });
});

describe("checkRouteBreakDirInvariant — geometry must match declared breakDir", () => {
  it("toward_qb passes when final x is negative (inside)", () => {
    // fixtureRoute has final x = -0.20 with breakDir "toward_qb" ✓
    const result = validateKG({ ...EMPTY_KG, routes: [fixtureRoute] });
    expect(result.ok).toBe(true);
  });

  it("toward_qb FAILS when final x is positive (outside)", () => {
    const bad: RouteDef = {
      ...fixtureRoute,
      points: [{ x: 0, y: 0 }, { x: 0.20, y: 0.10 }],  // final x is positive!
    };
    const result = validateKG({ ...EMPTY_KG, routes: [bad] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /breakDir="toward_qb"/.test(e.message))).toBe(true);
    }
  });

  it("vertical FAILS when |final x| > 0.10", () => {
    const bad: RouteDef = {
      ...fixtureRoute,
      breakDir: "vertical",
      points: [{ x: 0, y: 0 }, { x: -0.20, y: 0.55 }],
    };
    const result = validateKG({ ...EMPTY_KG, routes: [bad] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /breakDir="vertical"/.test(e.message))).toBe(true);
    }
  });
});

describe("FormationDefZ — schema validation", () => {
  it("accepts a spec-mode formation", () => {
    expect(FormationDefZ.safeParse(fixtureFormation).success).toBe(true);
  });

  it("accepts a customShape-mode formation", () => {
    const diamond: FormationDef = {
      id: "diamond",
      name: "Diamond",
      family: "formation",
      variants: ["flag_5v5"],
      description: "4-point geometric diamond — C short, X/Z wide intermediate, Y deep middle.",
      body: "Four-point shape that stretches the defense vertically AND horizontally. C top, X/Z lateral mid-depth, Y deep middle. The four points form a true diamond.",
      customShape: "diamond",
    };
    expect(FormationDefZ.safeParse(diamond).success).toBe(true);
  });

  it("accepts a positions-mode formation", () => {
    const custom: FormationDef = {
      id: "weird-stack",
      name: "Weird Stack",
      family: "formation",
      variants: ["flag_5v5"],
      description: "Custom one-off layout that doesn't fit spec or customShape.",
      body: "Some explicit-position formation for testing the third mode.",
      positions: {
        QB: { x: 0, y: -5, onLine: false },
        C: { x: 0, y: 0, onLine: true },
      },
    };
    expect(FormationDefZ.safeParse(custom).success).toBe(true);
  });

  it("REJECTS a formation with no spec, customShape, or positions", () => {
    const bad = {
      id: "empty-formation",
      name: "Empty",
      family: "formation",
      variants: ["flag_5v5"],
      description: "Has no mode specified at all.",
      body: "This formation defines no spec, no customShape, no positions — should fail validation.",
    };
    expect(FormationDefZ.safeParse(bad).success).toBe(false);
  });
});

describe("ConceptDefZ — schema validation", () => {
  it("accepts a canonical concept", () => {
    expect(ConceptDefZ.safeParse(fixtureConcept).success).toBe(true);
  });

  it("rejects a concept with no assignments", () => {
    const bad = { ...fixtureConcept, assignments: [] };
    expect(ConceptDefZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a concept with a non-kebab-case routeId reference", () => {
    const bad = {
      ...fixtureConcept,
      assignments: [{ player: "X", action: { kind: "route" as const, routeId: "Drag", depthYds: 2 } }],
    };
    expect(ConceptDefZ.safeParse(bad).success).toBe(false);
  });
});

describe("SchemeDefZ — schema validation", () => {
  it("accepts a canonical scheme", () => {
    expect(SchemeDefZ.safeParse(fixtureScheme).success).toBe(true);
  });

  it("rejects a scheme with no defenders", () => {
    const bad = { ...fixtureScheme, defenders: [] };
    expect(SchemeDefZ.safeParse(bad).success).toBe(false);
  });
});

describe("ReactorPatternDefZ — schema validation", () => {
  it("accepts a canonical reactor pattern", () => {
    expect(ReactorPatternDefZ.safeParse(fixtureReactorPattern).success).toBe(true);
  });

  it("accepts the '*' wildcard for conceptId", () => {
    const wild = { ...fixtureReactorPattern, conceptId: "*" };
    expect(ReactorPatternDefZ.safeParse(wild).success).toBe(true);
  });

  it("rejects a malformed behavior", () => {
    const bad = {
      ...fixtureReactorPattern,
      reactors: [{ defender: "NB", trigger: "X", behavior: "do_something", cue: "Trails." }],
    };
    expect(ReactorPatternDefZ.safeParse(bad).success).toBe(false);
  });
});

describe("DrillDefZ — schema validation", () => {
  it("accepts a canonical drill", () => {
    expect(DrillDefZ.safeParse(fixtureDrill).success).toBe(true);
  });

  it("rejects a drill with malformed playersNeeded (max < min)", () => {
    const bad = { ...fixtureDrill, playersNeeded: { min: 5, max: 2 } };
    expect(DrillDefZ.safeParse(bad).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Cross-reference validator tests                                    */
/* ------------------------------------------------------------------ */

describe("validateKG — empty KG is valid", () => {
  it("EMPTY_KG passes validation", () => {
    const result = validateKG(EMPTY_KG);
    expect(result.ok).toBe(true);
  });
});

describe("validateKG — fixture KG is valid", () => {
  it("fully wired fixtures pass cross-ref validation", () => {
    const kg: FootballKG = {
      routes: [fixtureRoute],
      formations: [fixtureFormation],
      schemes: [fixtureScheme],
      concepts: [fixtureConcept],
      reactorPatterns: [fixtureReactorPattern],
      drills: [fixtureDrill],
    };
    const result = validateKG(kg);
    if (!result.ok) {
      // Surface what failed for easier debugging on CI.
      throw new Error(`validation failed: ${JSON.stringify(result.errors, null, 2)}`);
    }
    expect(result.ok).toBe(true);
  });
});

describe("validateKG — dangling references caught", () => {
  it("concept referencing unknown formation fails", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      concepts: [{ ...fixtureConcept, defaultFormation: { id: "nonexistent" } }],
      routes: [fixtureRoute],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /defaultFormation.id "nonexistent"/.test(e.message))).toBe(true);
    }
  });

  it("concept referencing unknown route in assignments fails", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      concepts: [{
        ...fixtureConcept,
        assignments: [
          { player: "X", action: { kind: "route", routeId: "phantom-route", depthYds: 2 } },
        ],
      }],
      formations: [fixtureFormation],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /phantom-route/.test(e.message))).toBe(true);
    }
  });

  it("concept referencing unknown altFormation fails", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      concepts: [{
        ...fixtureConcept,
        altFormations: [{ id: "ghost-formation", note: "test" }],
      }],
      formations: [fixtureFormation],
      routes: [fixtureRoute],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /ghost-formation/.test(e.message))).toBe(true);
    }
  });

  it("reactor pattern referencing unknown scheme fails", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      reactorPatterns: [{ ...fixtureReactorPattern, schemeId: "no-such-scheme" }],
      concepts: [fixtureConcept],
      formations: [fixtureFormation],
      routes: [fixtureRoute],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /no-such-scheme/.test(e.message))).toBe(true);
    }
  });

  it("reactor pattern referencing unknown concept fails (and isn't wildcard)", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      reactorPatterns: [{ ...fixtureReactorPattern, conceptId: "ghost-concept" }],
      schemes: [fixtureScheme],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /ghost-concept/.test(e.message))).toBe(true);
    }
  });

  it("reactor pattern with wildcard conceptId passes even without a matching concept", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      reactorPatterns: [{ ...fixtureReactorPattern, conceptId: "*" }],
      schemes: [fixtureScheme],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(true);
  });

  it("reactor referencing defender not in scheme fails", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      reactorPatterns: [{
        ...fixtureReactorPattern,
        reactors: [
          { defender: "PHANTOM", trigger: "X", behavior: "jump_route", cue: "Drives down." },
        ],
      }],
      schemes: [fixtureScheme],
      concepts: [fixtureConcept],
      formations: [fixtureFormation],
      routes: [fixtureRoute],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /PHANTOM/.test(e.message))).toBe(true);
    }
  });

  it("reactor referencing suffixed defender (NB2) matches the bare role (NB) in the scheme", () => {
    // The scheme has TWO defenders both labeled "NB". The renderer
    // suffixes to NB / NB2 at output time. A reactor pattern can
    // reference "NB2" — the validator strips the trailing digit and
    // looks for "NB" in the scheme. This pin guards the existing
    // flag_5v5 reactor patterns (added 2026-05-23) which reference
    // NB2 and CB2 freely.
    const kg: FootballKG = {
      ...EMPTY_KG,
      reactorPatterns: [{
        ...fixtureReactorPattern,
        reactors: [
          { defender: "NB2", trigger: "Z", behavior: "wall_off", cue: "Trails @Z." },
        ],
      }],
      schemes: [fixtureScheme],
      concepts: [fixtureConcept],
      formations: [fixtureFormation],
      routes: [fixtureRoute],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(true);
  });

  it("duplicate id within a family fails", () => {
    const kg: FootballKG = {
      ...EMPTY_KG,
      routes: [fixtureRoute, { ...fixtureRoute, name: "Drag Variant 2" }],
    };
    const result = validateKG(kg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /duplicate id/.test(e.message))).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Lookup helper tests                                                */
/* ------------------------------------------------------------------ */

describe("findConcept — id + name + alias lookup", () => {
  const kg: FootballKG = {
    ...EMPTY_KG,
    concepts: [fixtureConcept],
    formations: [fixtureFormation],
    routes: [fixtureRoute],
  };

  it("finds by id (case-insensitive)", () => {
    expect(findConcept(kg, "mesh")?.id).toBe("mesh");
    expect(findConcept(kg, "MESH")?.id).toBe("mesh");
  });

  it("finds by display name", () => {
    expect(findConcept(kg, "Mesh")?.id).toBe("mesh");
  });

  it("finds by alias", () => {
    expect(findConcept(kg, "Crossers")?.id).toBe("mesh");
    expect(findConcept(kg, "mesh concept")?.id).toBe("mesh");
  });

  it("returns null for unknown queries", () => {
    expect(findConcept(kg, "ghost-concept")).toBeNull();
    expect(findConcept(kg, "")).toBeNull();
  });
});

describe("findFormation, findRoute, findScheme, findReactorPattern", () => {
  const kg: FootballKG = {
    routes: [fixtureRoute],
    formations: [fixtureFormation],
    schemes: [fixtureScheme],
    concepts: [fixtureConcept],
    reactorPatterns: [fixtureReactorPattern],
    drills: [],
  };

  it("findFormation locates by id", () => {
    expect(findFormation(kg, "doubles")?.id).toBe("doubles");
  });

  it("findRoute locates by id", () => {
    expect(findRoute(kg, "drag")?.id).toBe("drag");
  });

  it("findScheme locates by id", () => {
    expect(findScheme(kg, { id: "f5-cover-1" })?.id).toBe("f5-cover-1");
  });

  it("findScheme locates by front + coverage (case-insensitive)", () => {
    expect(findScheme(kg, { front: "5v5 man", coverage: "cover 1" })?.id).toBe("f5-cover-1");
  });

  it("findReactorPattern matches exact (variant, scheme, concept)", () => {
    expect(
      findReactorPattern(kg, {
        variant: "flag_5v5",
        schemeId: "f5-cover-1",
        conceptId: "mesh",
      })?.id,
    ).toBe("f5-cover1-vs-mesh");
  });

  it("findReactorPattern returns null when no match exists", () => {
    expect(
      findReactorPattern(kg, {
        variant: "flag_7v7",  // wrong variant
        schemeId: "f5-cover-1",
        conceptId: "mesh",
      }),
    ).toBeNull();
  });
});
