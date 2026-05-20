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
import { sanitizeCoachDiagram } from "./sanitize";
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
    | "defender_man_target_missing"
    | "sanitizer_dropped";
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

  // 3a) Second pass — emit visuals that span more than one player.
  //     RPO pass-option arrows anchor on the QB but point at the
  //     pass-side receiver; ballPath handoff arrows anchor at each
  //     mesh point between giver and receiver. Both render as short
  //     directional arrows tagged with `route_kind` so the converter
  //     can style them distinctly downstream. Each carrying player's
  //     run path still renders normally from their own carry
  //     assignment in the loop above.
  for (const assignment of spec.assignments) {
    if (assignment.action.kind !== "rpo_read") continue;
    const qb = offensePlayers.find((p) => p.id === assignment.player);
    if (!qb) continue; // already warned in the main loop
    routes.push(...rpoReadVisuals(qb, assignment.action, offensePlayers, warnings));
  }
  routes.push(...handoffArrowsFromBallPath(spec, offensePlayers, warnings));

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

  // Final defensive pass — clamp/drop any corrupt geometry so the
  // renderer never paints a broken diagram. Belt-and-suspenders:
  // synthesizers are supposed to produce clean output, but if a
  // catalog entry, a future schema change, or a hand-authored override
  // slips through, the sanitizer guarantees the visual stays sane.
  // See sanitize.ts for the full rule list.
  const rawDiagram: CoachDiagram = {
    title: spec.title,
    variant: spec.variant,
    focus: spec.playType === "defense" ? "D" : "O",
    players: [...offensePlayers, ...defensePlayers],
    routes,
    ...(defenseRender.zones.length > 0 ? { zones: defenseRender.zones } : {}),
  };
  const sanitized = sanitizeCoachDiagram(rawDiagram, spec.variant);
  for (const w of sanitized.warnings) {
    warnings.push({
      code: "sanitizer_dropped",
      message: `[${w.code}] ${w.message}`,
    });
  }
  return { diagram: sanitized.diagram, warnings };
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
  // `defense: { front: "unknown", coverage: "unknown" }` is the canonical
  // "no opponent specified" placeholder — emitted by inferDefense when a
  // diagram has no defenders, and a reasonable default for a fresh
  // offensive play. Treat it as structurally equivalent to omitting the
  // defense field entirely: render no defenders, no warning. A SPECIFIC
  // defense that misses the catalog (e.g. "4-3" / "Tampa-2") still
  // promotes to defense_unknown — that's Cal asking for something we
  // can't deliver, which IS a real error.
  if (front === "unknown" && coverage === "unknown") {
    return { players: [], zones: [], movement: [] };
  }
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
 *
 * Exported so compose_defense in coach-ai/tools.ts can reuse the same
 * geometry when applying the defensiveReactors catalog to a freehand
 * CoachDiagram fence (the tool path doesn't round-trip through PlaySpec).
 */
export function reactivePathFor(
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
        path: pathFromTemplate(template, carrier, variant, action.depthYds, action.direction),
        ...(hasCurveSegment(template) ? { curve: true } : {}),
        route_kind: template.name,
        // Preserve `direction` on the rendered route so edit tools
        // (modify_play_route / revise_play) can round-trip the
        // override without re-deriving it from path geometry. Without
        // this, a Flood Left @B's flat (which has direction:"left" on
        // the spec but x≈+2 carrier) silently flips to the right on
        // any depth/family edit (Rule 9 — identity preservation).
        ...(action.direction === "left" || action.direction === "right"
          ? { direction: action.direction }
          : {}),
        // Propagate `nonCanonical` from spec → route so the route-
        // assignment validator sees the explicit-off-catalog flag.
        // Without this, a spec route marked nonCanonical (e.g.
        // compose_play's auto-cap to honor a youth playbook's
        // max-throw-depth) re-tripped the catalog depth-range check
        // after rendering. Surfaced 2026-05-20: every 18yd Go in a
        // 14yd-cap playbook needed its depth clamped + nonCanonical
        // set, but only depthYds was making it to the fence.
        ...(action.nonCanonical === true ? { nonCanonical: true } : {}),
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
      // Cal frequently authors a carry assignment by intent only —
      // `{ kind: "carry", runType: "sweep" }` with no waypoints — and
      // expects the renderer to draw a sensible forward path. Before
      // 2026-05-04 the renderer returned null in this case and B (or
      // whoever the carrier was) silently disappeared from the diagram.
      // Surfaced by a Trips Right Jet Sweep where @B's spec was
      // `{ kind: "carry" }` and the rendered diagram had no entry for
      // B at all. Synthesize a default track from `runType` so the
      // ballcarrier is always visible. Coach-authored waypoints still
      // win when supplied.
      const path =
        action.waypoints && action.waypoints.length > 0
          ? action.waypoints
          : synthesizeCarryPath(carrier, variant, action.runType);
      return {
        from: carrier.id,
        path,
        // ballcarrier paths render as solid lines without a route_kind.
      };
    }
    case "motion":
    case "block":
    case "unspecified":
      // No visual route. Phase 3 will render motion arrows + block markers.
      return null;
    case "rpo_read":
      // The QB's rpo_read assignment is handled in a SECOND pass below
      // (rpoReadVisuals) so the helper can also see the offense
      // roster — it needs the passTo player's position to point the
      // pass-option arrow at. Returning null here keeps the main
      // loop's "one route per assignment" shape; the second pass adds
      // the QB's pass-option arrow alongside the existing carry +
      // route assignments the run-side and pass-side players already
      // contribute.
      return null;
  }
}

/**
 * Render the QB's RPO decision as a single short "pass-option" arrow
 * pointing from the QB toward the pass-side receiver. The arrow is
 * tagged with `route_kind: "rpo_pass_option"` so the downstream
 * converter can later style it distinctly (dashed when CoachDiagramRoute
 * grows a strokePattern field; for now it renders as a solid arrow
 * tinted by the role color).
 *
 * The run-side give and the pass-side route already render from those
 * players' OWN assignments — this helper only adds the QB-anchored
 * decision indicator that's missing without it.
 *
 * Why a short arrow (capped at ~3 yds): the read is conceptual, not
 * literal QB movement. A long arrow spanning from QB to S would imply
 * the QB is running there. Capping the arrow short of the target keeps
 * the visual cue ("QB is reading toward this player") without
 * confusing it with an actual scramble path.
 *
 * Future polish: once defensiveAlignments grows a conflictDefender()
 * resolver, a SECOND short arrow points from QB toward the key
 * defender's catalog position. That's the visual "read THIS guy"
 * cue. Held back from this iteration because it depends on a catalog
 * extension that isn't built yet.
 */
function rpoReadVisuals(
  qb: CoachDiagramPlayer,
  action: Extract<AssignmentAction, { kind: "rpo_read" }>,
  offense: CoachDiagramPlayer[],
  warnings: RenderWarning[],
): CoachDiagramRoute[] {
  const passTarget = offense.find((p) => p.id === action.passTo);
  if (!passTarget) {
    warnings.push({
      code: "assignment_player_missing",
      message: `RPO read on @${qb.id} targets @${action.passTo} on the pass branch but no such player is in the formation. Either add the receiver to the formation or change passTo.`,
    });
    return [];
  }
  // End the arrow ~1 yd short of the receiver, capped at 3 yds total —
  // it's a decision indicator, not literal QB travel.
  const dx = passTarget.x - qb.x;
  const dy = passTarget.y - qb.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return [];
  const capped = Math.min(len - 1, 3);
  if (capped <= 0) return [];
  const ratio = capped / len;
  return [
    {
      from: qb.id,
      path: [[round(qb.x + dx * ratio), round(qb.y + dy * ratio)]],
      tip: "arrow",
      route_kind: "rpo_pass_option",
      // Slight playback delay so the read visually follows the snap.
      startDelaySec: 0.15,
    },
  ];
}

/**
 * Render each ballPath step as a short directional arrow at the mesh
 * point — the visual "exchange happens here, going to player X."
 *
 * The geometry is intentionally short (~1-2 yds): the carrying player's
 * actual run path is already drawn from their own `kind: "carry"`
 * assignment. The handoff arrow just MARKS the exchange so a coach can
 * read the play's ball-flow at a glance ("QB hands to B at the mesh,
 * B hands to Z over here").
 *
 * Anchor:
 *   - When `atPoint` is set, the arrow starts there and points
 *     a short distance toward the receiver's natural starting
 *     position.
 *   - When `atPoint` is omitted, the arrow starts at the giver's
 *     position (the renderer doesn't yet infer the mesh point from
 *     carry-waypoint endpoints; that's a follow-up).
 *
 * Each emitted route uses `from: <giver-id>` so the existing player-
 * id lookup at the converter layer associates the arrow with the
 * giver. The `route_kind: "handoff"` tag is the hook for future
 * dashed-style differentiation.
 */
function handoffArrowsFromBallPath(
  spec: PlaySpec,
  offense: CoachDiagramPlayer[],
  warnings: RenderWarning[],
): CoachDiagramRoute[] {
  if (!spec.ballPath || spec.ballPath.length === 0) return [];
  // Skip the handoff arrow when BOTH the giver AND the receiver have
  // `kind: carry` waypoints that pass through (or near) the mesh point.
  // Both paths converging visually at the mesh IS the handoff — adding
  // an indicator arrow on top reads as a third movement and clutters
  // the diagram. Surfaced 2026-05-13 on Flea Flicker, where the QB
  // and the carrier both routed through the mesh with explicit
  // waypoints AND the renderer was drawing the indicator arrow
  // anyway (resulting in two arrowheads on the QB).
  //
  // The arrow is KEPT when EITHER end is static (kind:"block" /
  // "unspecified", e.g. Jet Reverse's QB) or when only one player's
  // carry passes through the mesh (e.g. Jet Reverse's B → Z step,
  // where B ends at the mesh but Z's carry starts far from it — the
  // arrow is the only visual indicator that Z takes the ball there).
  //
  // Why "passes through or near" rather than strict containment: the
  // carry's waypoints may be ROUNDED versions of the ballPath atPoint
  // (the renderer uses `round()` before emitting paths), so an exact
  // equality check would miss valid matches. A 1.5-yd radius matches
  // the existing handoff-arrow cap length — within that radius, the
  // arrow would overlay the carry path's last segment.
  const carriersWithPaths = new Map<string, [number, number][]>();
  for (const a of spec.assignments) {
    if (a.action.kind !== "carry") continue;
    if (a.action.waypoints && a.action.waypoints.length > 0) {
      carriersWithPaths.set(a.player, a.action.waypoints);
    }
  }
  const pathPassesNear = (
    path: [number, number][] | undefined,
    point: [number, number],
  ): boolean => {
    if (!path) return false;
    return path.some(([wx, wy]) => Math.hypot(wx - point[0], wy - point[1]) < 1.5);
  };

  const out: CoachDiagramRoute[] = [];
  for (const step of spec.ballPath) {
    const giver = offense.find((p) => p.id === step.from);
    const receiver = offense.find((p) => p.id === step.to);
    if (!giver) {
      warnings.push({
        code: "assignment_player_missing",
        message: `ballPath step from "${step.from}" but no such player in the formation. Either add the player or fix the ballPath step.`,
      });
      continue;
    }
    if (!receiver) {
      warnings.push({
        code: "assignment_player_missing",
        message: `ballPath step to "${step.to}" but no such player in the formation. Either add the player or fix the ballPath step.`,
      });
      continue;
    }
    // Anchor the arrow: prefer atPoint, fall back to giver's position.
    const ax = step.atPoint ? step.atPoint[0] : giver.x;
    const ay = step.atPoint ? step.atPoint[1] : giver.y;

    // Skip-when-redundant: BOTH giver and receiver have carry paths
    // passing through the mesh. Both polylines converging there is
    // the handoff; the indicator arrow adds nothing.
    const mesh: [number, number] = [ax, ay];
    const giverPasses = pathPassesNear(carriersWithPaths.get(step.from), mesh);
    const receiverPasses = pathPassesNear(carriersWithPaths.get(step.to), mesh);
    if (giverPasses && receiverPasses) continue;

    // Point a short distance (1.5 yds) toward the receiver to indicate
    // direction; cap so the arrow doesn't span the field.
    const dx = receiver.x - ax;
    const dy = receiver.y - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) continue;
    const capped = Math.min(len, 1.5);
    const ratio = capped / len;
    out.push({
      from: giver.id,
      path: [
        [round(ax), round(ay)],
        [round(ax + dx * ratio), round(ay + dy * ratio)],
      ],
      tip: "arrow",
      route_kind: "handoff",
      // Each successive handoff fires a beat later so a multi-exchange
      // play visualizes as a sequence rather than simultaneously.
      startDelaySec: 0.1 * (out.length + 1),
    });
  }
  return out;
}

/**
 * Synthesize a default forward path for a `carry` assignment that has
 * no explicit waypoints. The runType picks the gap shape:
 *   - sweep / outside_zone — wide arc to the strong side, 6 yards
 *   - draw / qb_keep / scramble — straight ahead, 5 yards
 *   - power / counter / inside_zone / trap — between the tackles,
 *     4 yards
 *   - default — straight ahead, 4 yards
 *
 * The lateral direction defaults to the carrier's side of the field
 * (positive carrier.x → right). Coaches who want the opposite
 * direction author waypoints explicitly. The runner ALWAYS gets a
 * visible forward path so they can't disappear from the diagram.
 */
function synthesizeCarryPath(
  carrier: CoachDiagramPlayer,
  variant: SportVariant,
  runType?: string,
): [number, number][] {
  const fieldWidthYds = sportProfileForVariant(variant).fieldWidthYds;
  const sideSign = carrier.x >= 0 ? 1 : -1;
  const startY = carrier.y;
  const startX = carrier.x;

  const wide = (depthYds: number, lateralYds: number): [number, number][] => {
    const targetX = clamp(startX + sideSign * lateralYds, -(fieldWidthYds - 2), fieldWidthYds - 2);
    return [
      [startX + sideSign * 0.5, startY + 0.5],
      [targetX, startY + depthYds * 0.4],
      [targetX, startY + depthYds],
    ];
  };
  const straight = (depthYds: number): [number, number][] => [
    [startX, startY + depthYds],
  ];
  const between = (depthYds: number): [number, number][] => {
    // Slight lateral kick toward the playside gap so the path doesn't
    // sit on top of the QB's vertical column.
    const kickX = startX + sideSign * 1.5;
    return [
      [kickX, startY + 1],
      [kickX, startY + depthYds],
    ];
  };

  switch (runType) {
    case "sweep":
    case "outside_zone":
      return wide(6, 8);
    case "power":
    case "counter":
    case "trap":
    case "inside_zone":
      return between(4);
    case "draw":
    case "qb_keep":
    case "scramble":
      return straight(5);
    default:
      return straight(4);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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
  direction?: "left" | "right",
): [number, number][] {
  const fieldWidthYds = sportProfileForVariant(variant).fieldWidthYds;
  // template.points use a "natural" coord system: positive x means
  // OUTSIDE (toward sideline); negative x means INSIDE (toward
  // QB/middle). Different families pick different signs depending on
  // semantics — Flat/Out terminate at positive x; Drag/Dig/Slant
  // terminate at negative x.
  //
  // Decide xSign:
  //   1. Explicit `direction` override wins for directional templates.
  //      We must factor the TEMPLATE's natural-sign in: a template
  //      whose terminal waypoint is at -0.45 (Drag, "toward middle")
  //      needs xSign=-1 to render rightward, NOT +1. Without this
  //      factoring, Flood Right's backside-drag rendered LEFTWARD
  //      because the previous `direction="right" → xSign=+1` rule
  //      silently relied on the Flat template's positive terminal
  //      and broke for Drag. Surfaced 2026-05-02 (third Flood bug).
  //   2. Otherwise, directional templates point toward the carrier's
  //      natural sideline (right when x ≥ 0).
  //   3. Non-directional templates (Go, Seam) ignore xSign entirely.
  const xSign = (() => {
    if (template.directional === false) return 1;
    if (direction === "left" || direction === "right") {
      const lastPt = template.points[template.points.length - 1];
      const naturalSign = lastPt && lastPt.x !== 0 ? Math.sign(lastPt.x) : 1;
      const desiredSign = direction === "right" ? 1 : -1;
      // Flip xSign so that template_x * xSign ends up with the desired
      // absolute sign, regardless of which side the template's
      // natural-direction points to.
      return desiredSign * naturalSign;
    }
    return carrier.x >= 0 ? 1 : -1;
  })();

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
