/**
 * Renderer: PlaySpec → CoachDiagram.
 *
 * Deterministic projection from semantic spec to renderable diagram.
 * Player positions come from the offensive synthesizer + defensive
 * alignment catalog — never from the spec itself. This is the structural
 * guarantee that "the spec says X = the diagram shows X": there's no
 * coordinate freedom for the spec to lie about.
 *
 * Output is a CoachDiagram, which then flows through the existing
 * coachDiagramToPlayDocument converter for persistence + rendering.
 *
 * Loss-of-information cases:
 *   - { kind: "custom" } actions: waypoints are emitted verbatim
 *     (the spec stored the geometry rather than a family).
 *   - { kind: "unspecified" } actions: player is placed but no route
 *     emitted.
 *   - Missing/unknown formations: synthesizeOffenseFallback (Spread
 *     Doubles) is used. Caller can detect this via the returned warnings.
 *   - Missing/unknown defenses: defenders omitted (spec.defense
 *     placeholder won't render anything).
 */

import type {
  CoachDiagram,
  CoachDiagramPlayer,
  CoachDiagramRoute,
  CoachDiagramZone,
} from "@/features/coach-ai/coachDiagramConverter";
import type {
  AssignmentAction,
  DefenderAction,
  DefenderAssignment,
  PlaySpec,
} from "./spec";
import {
  synthesizeOffense,
  synthesizeOffenseFallback,
  type SynthOffense,
} from "./offensiveSynthesize";
import {
  alignmentForStrength,
  alignmentWithAssignments,
  findDefensiveAlignment,
  findZoneById,
  zonesForStrength,
  type DefenderAssignmentSpec,
  type DefensiveAlignment,
  type DefensiveAlignmentZone,
} from "./defensiveAlignments";
import { sportProfileForVariant } from "./factory";
import { findTemplate, ROUTE_TEMPLATES, type RouteTemplate } from "./routeTemplates";
import type { SportVariant } from "./types";

/** Field length is 25 for every variant; field width depends on variant. */
const FIELD_LENGTH_YDS = 25;

export type RenderWarning = {
  code:
    | "formation_fallback"
    | "defense_unknown"
    | "assignment_player_missing"
    | "route_template_missing"
    | "formation_player_count_mismatch"
    | "defender_assignment_player_missing"
    | "defender_zone_unknown"
    | "defender_man_target_missing";
  message: string;
};

export type RenderResult = {
  diagram: CoachDiagram;
  warnings: RenderWarning[];
};

/** Render a PlaySpec into a CoachDiagram. */
export function playSpecToCoachDiagram(spec: PlaySpec): RenderResult {
  const warnings: RenderWarning[] = [];

  // 1) Build offensive players via the synthesizer (named formation →
  //    canonical positions). Fallback to Spread Doubles if the name
  //    doesn't parse.
  const requestedName = spec.formation.name || "Spread Doubles";
  let synth: SynthOffense | null = synthesizeOffense(spec.variant, requestedName);
  if (!synth) {
    synth = synthesizeOffenseFallback(spec.variant);
    if (synth) {
      warnings.push({
        code: "formation_fallback",
        message: `Could not parse formation "${requestedName}"; rendered as Spread Doubles. Edit the spec.formation.name to a recognizable formation.`,
      });
    }
  }
  if (!synth) {
    // Variant didn't resolve — synthesizer returns null for unknowns.
    // Emit an empty diagram so the call doesn't crash.
    return { diagram: { variant: spec.variant, players: [], routes: [] }, warnings };
  }

  // Player-count integrity guard (AGENTS.md Rule 5: make it impossible).
  // The synthesizer is supposed to return the variant's full count
  // (tackle_11 → 11, flag_7v7 → 7, flag_5v5 → 5). Anything less is a
  // synthesizer bug — historically Pro Set / Pro I / I-form silently
  // returned 10 players for tackle_11 (missing Z) because the TE
  // consumed a right-side WR slot. Saving plays from those broken
  // outputs produced misshapen thumbnails.
  //
  // We surface the count mismatch as a warning rather than crashing —
  // the resolver in play-tools then promotes it to an error for spec
  // input, blocking persistence. The legacy diagram path doesn't run
  // this code, so its existing behavior is unchanged.
  const expectedCount = sportProfileForVariant(spec.variant).offensePlayerCount;
  if (synth.players.length !== expectedCount) {
    warnings.push({
      code: "formation_player_count_mismatch",
      message:
        `Synthesizer returned ${synth.players.length} offensive players for "${requestedName}" ` +
        `(${spec.variant} expects ${expectedCount}). The formation parser is missing a player — ` +
        `commonly the Z (right WR) when te=1 + right=1, or a back. Either pick a different ` +
        `formation that synthesizes to the right count, or fix the parser entry in ` +
        `offensiveSynthesize.ts.`,
    });
  }

  const offensePlayers: CoachDiagramPlayer[] = synth.players.map((p) => ({
    id: p.id,
    role: p.id,
    x: p.x,
    y: p.y,
    team: "O",
  }));

  // 2) Build defensive players via the alignment catalog (when defense
  //    ref provided + matched). Also resolves per-defender assignments —
  //    catalog defaults overlaid with `spec.defenderAssignments`
  //    deviations — and emits the corresponding zones and movement
  //    routes (man-match arrows, blitz arrows, custom paths).
  const defenseRender = renderDefense(spec, warnings);
  const defensePlayers = defenseRender.players;

  // 3) Build routes from assignments. Skip players the synthesizer
  //    didn't place (warn about it). Skip non-route actions — they
  //    don't emit visual paths in v1 (block/carry/motion will get
  //    visuals in Phase 3).
  const routes: CoachDiagramRoute[] = [];
  for (const assignment of spec.assignments) {
    const carrier = offensePlayers.find((p) => p.id === assignment.player);
    if (!carrier) {
      warnings.push({
        code: "assignment_player_missing",
        message: `Assignment for "${assignment.player}" but no such player in formation "${requestedName}". Either change the formation or rename the player in the assignment.`,
      });
      continue;
    }
    const route = routeFromAction(assignment.action, carrier, spec.variant, warnings);
    if (route) routes.push(route);
  }

  // 4) Build defender movement routes from resolved defender assignments.
  //    Man-match arrows need offensive positions to point at, so we pass
  //    `offensePlayers` for receiver lookup. Blitz arrows aim at the QB
  //    (or interior gap) regardless of whether the offense is rendered.
  for (const dm of defenseRender.movement) {
    const route = routeFromDefenderAction(
      dm.action,
      dm.defender,
      offensePlayers,
      warnings,
    );
    if (route) routes.push(route);
  }

  return {
    diagram: {
      title: spec.title,
      variant: spec.variant,
      focus: spec.playType === "defense" ? "D" : "O",
      players: [...offensePlayers, ...defensePlayers],
      routes,
      ...(defenseRender.zones.length > 0 ? { zones: defenseRender.zones } : {}),
    },
    warnings,
  };
}

type DefenderRenderResult = {
  /** Defender player tokens (same shape as offense, team:"D"). */
  players: CoachDiagramPlayer[];
  /** Zones drawn for `zone_drop` defenders. Empty for pure-man looks. */
  zones: CoachDiagramZone[];
  /**
   * Per-defender movement to project to routes downstream.
   * `defender` is the rendered CoachDiagramPlayer (post-mirror), so we
   * already know the (x, y) origin. `action` is the resolved action
   * (catalog default overlaid by spec deviation).
   */
  movement: Array<{ defender: CoachDiagramPlayer; action: DefenderAction }>;
};

function renderDefense(spec: PlaySpec, warnings: RenderWarning[]): DefenderRenderResult {
  if (!spec.defense) return { players: [], zones: [], movement: [] };
  const { front, coverage, strength = "right" } = spec.defense;
  const alignment = findDefensiveAlignment(spec.variant, front, coverage);
  if (!alignment) {
    warnings.push({
      code: "defense_unknown",
      message: `No catalog match for defense ${front} / ${coverage} (variant ${spec.variant}). Defenders not rendered. Use one of the catalog combinations or call place_defense to synthesize.`,
    });
    return { players: [], zones: [], movement: [] };
  }

  // Resolve player positions + catalog assignments for this strength.
  const catalogPlayers = alignmentWithAssignments(alignment, strength);

  // Suffix duplicate role labels so every defender has a UNIQUE diagram
  // id. The catalog uses positional labels (two DTs, two CBs in many
  // alignments) which collide as ids; downstream validation rejects
  // duplicates with "Duplicate player id" and the routes can't address
  // the second of a pair. Convention matches the offense path
  // (playDocumentToCoachDiagram): first occurrence keeps the bare label,
  // second becomes "DT2", third "DT3", etc. The display `role` always
  // stays the bare label so the diagram still shows "DT" inside both
  // triangles.
  const seen = new Map<string, number>();
  const uniqueIds = catalogPlayers.map((cp) => {
    const count = (seen.get(cp.id) ?? 0) + 1;
    seen.set(cp.id, count);
    return count === 1 ? cp.id : `${cp.id}${count}`;
  });

  // Index spec deviations by defender id. Coaches reference defenders
  // by the SUFFIXED id (matching the rendered diagram); we also accept
  // the bare label and apply it to the first occurrence as a
  // convenience for single-defender coverages.
  const overrides = new Map<string, DefenderAction>();
  if (spec.defenderAssignments) {
    for (const da of spec.defenderAssignments) {
      const idxByUnique = uniqueIds.findIndex((id) => id === da.defender);
      const idxByBare = idxByUnique >= 0 ? idxByUnique : catalogPlayers.findIndex((p) => p.id === da.defender);
      if (idxByBare < 0) {
        warnings.push({
          code: "defender_assignment_player_missing",
          message: `defenderAssignment for "${da.defender}" but no such defender in ${alignment.front}/${alignment.coverage}. Pick one of: ${uniqueIds.join(", ")}.`,
        });
        continue;
      }
      const key = uniqueIds[idxByBare];
      // First override wins — same dedup discipline as PlayerAssignment.
      if (!overrides.has(key)) overrides.set(key, da.action);
    }
  }

  const players: CoachDiagramPlayer[] = [];
  const movement: Array<{ defender: CoachDiagramPlayer; action: DefenderAction }> = [];
  /** zoneId → owning defender's bare role label (used to color the zone
   *  to match its triangle in the converter). First defender to claim a
   *  zoneId wins; subsequent zone_drops on the same id (rare) fall
   *  through to the default blue. */
  const zoneOwners = new Map<string, string>();
  const usedZoneIds = new Set<string>();

  for (let i = 0; i < catalogPlayers.length; i++) {
    const cp = catalogPlayers[i];
    const uid = uniqueIds[i];
    const player: CoachDiagramPlayer = {
      id: uid,
      role: cp.id,
      x: cp.x,
      y: cp.y,
      team: "D",
    };
    players.push(player);

    // Resolve the action: spec override → bridge to DefenderAction; else
    // promote the catalog assignment to the spec-shape DefenderAction.
    const override = overrides.get(uid);
    const action: DefenderAction = override ?? defenderActionFromCatalog(cp.assignment);

    // Zone drop: collect the referenced zone for emission below + remember
    // who owns it so the converter can color the zone to match the triangle.
    if (action.kind === "zone_drop") {
      const zoneId = action.zoneId ?? (cp.assignment.kind === "zone" ? cp.assignment.zoneId : undefined);
      if (zoneId) {
        usedZoneIds.add(zoneId);
        if (!zoneOwners.has(zoneId)) zoneOwners.set(zoneId, cp.id);
      }
    }

    // All other kinds emit movement (man-match line, blitz arrow,
    // custom path, read-and-react). zone_drop has no per-defender
    // movement — the zone shape is the visual.
    if (action.kind !== "zone_drop") {
      movement.push({ defender: player, action });
    }
  }

  // Build zones: every catalog zone whose id is referenced gets drawn.
  // For pure-man looks (no zone_drops), zones is empty — the renderer
  // intentionally suppresses the labels rather than half-showing them.
  const allZones = zonesForStrength(alignment, strength);
  const zones: CoachDiagramZone[] = [];
  for (const z of allZones) {
    if (z.id && usedZoneIds.has(z.id)) {
      const owner = zoneOwners.get(z.id);
      zones.push({
        kind: z.kind,
        center: [z.center[0], z.center[1]],
        size: [z.size[0], z.size[1]],
        label: z.label,
        ...(owner ? { ownerLabel: owner } : {}),
      });
    }
  }

  // Validate spec-side zone_drop overrides reference real zones.
  for (const [, action] of overrides) {
    if (action.kind !== "zone_drop") continue;
    if (!action.zoneId) continue;
    const exists = allZones.some((z) => z.id === action.zoneId);
    if (!exists) {
      warnings.push({
        code: "defender_zone_unknown",
        message: `defenderAssignment.zone_drop references zoneId "${action.zoneId}" but ${alignment.front}/${alignment.coverage} has no such zone. Available: ${allZones.map((z) => z.id).filter(Boolean).join(", ")}.`,
      });
    }
  }

  return { players, zones, movement };
}

/** Bridge: catalog DefenderAssignmentSpec → spec DefenderAction. */
function defenderActionFromCatalog(c: DefenderAssignmentSpec): DefenderAction {
  switch (c.kind) {
    case "zone": return { kind: "zone_drop", zoneId: c.zoneId };
    case "man":  return { kind: "man_match", target: c.target };
    case "blitz": return { kind: "blitz", gap: c.gap };
    case "spy":  return { kind: "spy", target: c.target };
  }
}

/**
 * Project a DefenderAction into a CoachDiagramRoute, anchored at the
 * defender's position. Returns null when the action shouldn't render
 * a movement line (zone_drop is handled by zone shapes, not paths).
 *
 * Geometry conventions:
 *   - man_match: short arrow from defender to target receiver. Capped
 *     so the arrow is readable rather than spanning the field; the
 *     animation engine pulls the defender on the snap.
 *   - blitz: arrow from defender position toward (gap_x, 0) — i.e.
 *     toward the LOS through the named rush lane.
 *   - spy: small loop near the defender (drawn as a tiny arc).
 *   - custom_path: waypoints passed through verbatim.
 *   - read_and_react: rendered as a dashed conditional arrow with a
 *     short startDelaySec to communicate "reactive". Phase D7 will
 *     teach the animation engine to gate on the trigger.
 */
function routeFromDefenderAction(
  action: DefenderAction,
  defender: CoachDiagramPlayer,
  offense: CoachDiagramPlayer[],
  warnings: RenderWarning[],
): CoachDiagramRoute | null {
  switch (action.kind) {
    case "zone_drop":
      return null; // visual handled by zone shape
    case "man_match": {
      const target = action.target ? offense.find((p) => p.id === action.target) : null;
      if (!target) {
        if (action.target) {
          warnings.push({
            code: "defender_man_target_missing",
            message: `Defender ${defender.id} matched on "${action.target}" but no such offensive player in the diagram. Add the receiver to the formation or change the target.`,
          });
        }
        return null;
      }
      // End the arrow ~1 yard short of the target so the head lands on
      // them rather than crossing through. Kept simple — a single
      // segment from defender → target.
      const dx = target.x - defender.x;
      const dy = target.y - defender.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return null;
      const ratio = Math.max(0, (len - 1) / len);
      const endX = defender.x + dx * ratio;
      const endY = defender.y + dy * ratio;
      return {
        from: defender.id,
        path: [[round(endX), round(endY)]],
        tip: "arrow",
        startDelaySec: 0.2,
      };
    }
    case "blitz": {
      // Aim toward the LOS through the named gap. Simple model: A is
      // x≈±1.5, B≈±3.5, C≈±6, D≈±9, edge≈±10 (sign matches defender's
      // side of the field). End at y=0 (LOS).
      const gapWidth: Record<NonNullable<typeof action.gap>, number> = {
        A: 1.5, B: 3.5, C: 6, D: 9, edge: 10.5,
      };
      const gx = gapWidth[action.gap ?? "A"];
      const xSign = defender.x === 0 ? 1 : (defender.x > 0 ? 1 : -1);
      return {
        from: defender.id,
        path: [[round(xSign * gx), 0]],
        tip: "arrow",
        startDelaySec: 0,
      };
    }
    case "spy": {
      // Small "stay-here" loop — defender holds position. We render
      // this as a near-zero-length path so the engine has something to
      // attach the spy marker to without producing a long arrow.
      return {
        from: defender.id,
        path: [[round(defender.x + 0.5), round(defender.y - 0.5)]],
        tip: "none",
        startDelaySec: 0,
      };
    }
    case "custom_path": {
      if (!action.waypoints || action.waypoints.length === 0) return null;
      return {
        from: defender.id,
        path: action.waypoints,
        ...(action.curve ? { curve: true } : {}),
        tip: "arrow",
      };
    }
    case "read_and_react": {
      // Phase D7: reactive movement. Geometry depends on the trigger
      // player's route + the named behavior. Each behavior produces a
      // distinct path shape so the diagram visibly shows the reaction.
      //
      // Behaviors:
      //   - jump_route: defender drives to the route's break point.
      //   - carry_vertical: defender follows the trigger straight up
      //     a few yards then bails (the deep defender takes it).
      //   - follow_to_flat: defender mirrors the trigger's release
      //     and continues to the flat sideline.
      //   - wall_off: defender steps inside-out to intercept a crosser.
      //   - robber: defender drops to intermediate depth in the middle.
      //
      // The geometry is best-effort — without a fully-rendered diagram
      // it can't perfectly intersect the route. The visual cue (delay +
      // route_kind tag) communicates "this is reactive."
      const trigger = action.trigger.player;
      const target = offense.find((p) => p.id === trigger);
      if (!target) return null;
      const path = reactivePathFor(action.behavior, defender, target);
      return {
        from: defender.id,
        path,
        tip: "arrow",
        startDelaySec: 0.6,
        route_kind: `react_${action.behavior}`,
      };
    }
  }
}

/**
 * Compute waypoints for a reactive defender given the named behavior
 * and trigger receiver. All paths anchor from the defender's position
 * (the renderer doesn't include the start node in the route's path —
 * it's added downstream from the carrier position).
 */
function reactivePathFor(
  behavior: Extract<DefenderAction, { kind: "read_and_react" }>["behavior"],
  defender: CoachDiagramPlayer,
  target: CoachDiagramPlayer,
): [number, number][] {
  switch (behavior) {
    case "jump_route": {
      // Drive to a point ~2 yds short of the trigger's current spot,
      // along the line from defender to trigger. Single waypoint.
      const dx = target.x - defender.x;
      const dy = target.y - defender.y;
      const len = Math.hypot(dx, dy) || 1;
      const ratio = Math.max(0.1, (len - 2) / len);
      return [[round(defender.x + dx * ratio), round(defender.y + dy * ratio)]];
    }
    case "carry_vertical": {
      // Step downfield 5 yds (toward the trigger's depth), then break
      // off to the inside.
      const xSign = target.x >= 0 ? 1 : -1;
      return [
        [round(defender.x), round(defender.y + 5)],
        [round(defender.x - xSign * 2), round(defender.y + 7)],
      ];
    }
    case "follow_to_flat": {
      // Mirror the trigger's release laterally, ending in the flat
      // (~3 yds depth, same side).
      const xSign = target.x >= 0 ? 1 : -1;
      return [
        [round(defender.x + xSign * 3), round(defender.y - 1)],
        [round(defender.x + xSign * 8), round(defender.y - 2)],
      ];
    }
    case "wall_off": {
      // Step inside-out to cut off the crosser. Single waypoint at the
      // midpoint between defender and trigger, biased toward the
      // defender's depth so it's a square-up step rather than a chase.
      const midX = (defender.x + target.x) / 2;
      return [[round(midX), round(defender.y)]];
    }
    case "robber": {
      // Drop to intermediate depth in the middle of the field. End at
      // x≈0, y≈8 (catalog Cover 1 FS depth is ~13, so 8 is "robber"
      // depth — between the underneath defenders and the deep safety).
      return [[0, 8]];
    }
  }
}

function routeFromAction(
  action: AssignmentAction,
  carrier: CoachDiagramPlayer,
  variant: SportVariant,
  warnings: RenderWarning[],
): CoachDiagramRoute | null {
  switch (action.kind) {
    case "route": {
      const template = findTemplate(action.family);
      if (!template) {
        warnings.push({
          code: "route_template_missing",
          message: `Route family "${action.family}" not in catalog. Pick one of: ${ROUTE_TEMPLATES.map((t) => t.name).join(", ")}.`,
        });
        return null;
      }
      return {
        from: carrier.id,
        path: pathFromTemplate(template, carrier, variant, action.depthYds),
        ...(hasCurveSegment(template) ? { curve: true } : {}),
        route_kind: template.name,
      };
    }
    case "custom": {
      if (!action.waypoints || action.waypoints.length === 0) return null;
      return {
        from: carrier.id,
        path: action.waypoints,
        ...(action.curve ? { curve: true } : {}),
      };
    }
    case "carry": {
      if (!action.waypoints || action.waypoints.length === 0) return null;
      return {
        from: carrier.id,
        path: action.waypoints,
        // ballcarrier paths render as solid lines without a route_kind.
        ...(action.runType ? {} : {}),
      };
    }
    case "motion":
    case "block":
    case "unspecified":
      // No visual route. Phase 3 will render motion arrows + block markers.
      return null;
  }
}

/**
 * Convert a RouteTemplate into [x, y] yard-waypoints anchored at the
 * carrier's position. Mirrors instantiateTemplate's logic but emits in
 * the CoachDiagram coord system (yards from center / LOS) rather than
 * normalized field fractions, so it's compatible with downstream
 * coachDiagramToPlayDocument.
 *
 * fieldLengthYds = 25 across all variants; fieldWidthYds comes from the
 * variant's sport profile.
 *
 * depthYds (optional): when set, scales every waypoint's y proportionally
 * so the deepest template waypoint lands at exactly `depthYds` yards from
 * the LOS. This is the per-assignment override that makes concept-level
 * route adaptations actually render — e.g. a Mesh's two drags can now
 * render at 2yd (under) and 4yd (over) when Cal sets depthYds on each.
 *
 * The scale is applied to ALL y-values (including the release stem and
 * intermediate anchors), so a drag's pinned-flat cross stays pinned at
 * whatever depth it's scaled to. Routes whose template has zero positive
 * depth (rare — only Bubble has all negatives) skip scaling to avoid
 * divide-by-zero; routes whose template has both positive and negative
 * y values (none currently) would need a sign-aware scale, but the
 * current catalog doesn't exercise that case.
 */
function pathFromTemplate(
  template: RouteTemplate,
  carrier: CoachDiagramPlayer,
  variant: SportVariant,
  depthYds?: number,
): [number, number][] {
  const fieldWidthYds = sportProfileForVariant(variant).fieldWidthYds;
  // template.points are in normalized template coords (positive x = OUTSIDE).
  // Decide xSign based on which side of the field the carrier is on.
  // CoachDiagram uses yards from CENTER; carrier.x < 0 = left side.
  const xSign = template.directional !== false
    ? (carrier.x >= 0 ? 1 : -1)
    : 1;

  // Per-assignment depth override: scale every y proportionally so the
  // template's deepest waypoint lands at depthYds. Only positive depths
  // scale (negative-only templates like Bubble use their natural depth).
  const templateMaxYNorm = Math.max(...template.points.map((p) => p.y));
  const templateMaxYds = templateMaxYNorm * FIELD_LENGTH_YDS;
  const yScale =
    depthYds !== undefined && templateMaxYds > 0.5
      ? depthYds / templateMaxYds
      : 1;

  // Skip the first template point — it's the carrier-relative origin
  // (0, 0), which downstream coachDiagramToPlayDocument adds as the
  // start node from the carrier's position. Including it here produced
  // duplicate consecutive nodes (degenerate zero-length segment) on
  // every spec-rendered route, surfaced 2026-05-01.
  const waypoints = template.points[0]?.x === 0 && template.points[0]?.y === 0
    ? template.points.slice(1)
    : template.points;
  return waypoints.map(({ x, y }) => {
    const xYds = carrier.x + x * fieldWidthYds * xSign;
    const yYds = carrier.y + y * yScale * FIELD_LENGTH_YDS;
    return [round(xYds), round(yYds)] as [number, number];
  });
}

function hasCurveSegment(template: RouteTemplate): boolean {
  return (template.shapes ?? []).some((s) => s === "curve");
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
