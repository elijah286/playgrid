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

import type { CoachDiagram, CoachDiagramPlayer, CoachDiagramRoute } from "@/features/coach-ai/coachDiagramConverter";
import type { AssignmentAction, PlaySpec } from "./spec";
import {
  synthesizeOffense,
  synthesizeOffenseFallback,
  type SynthOffense,
} from "./offensiveSynthesize";
import {
  alignmentForStrength,
  findDefensiveAlignment,
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
    | "formation_player_count_mismatch";
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
  //    ref provided + matched).
  const defensePlayers = renderDefense(spec, warnings);

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

  return {
    diagram: {
      title: spec.title,
      variant: spec.variant,
      focus: spec.playType === "defense" ? "D" : "O",
      players: [...offensePlayers, ...defensePlayers],
      routes,
    },
    warnings,
  };
}

function renderDefense(spec: PlaySpec, warnings: RenderWarning[]): CoachDiagramPlayer[] {
  if (!spec.defense) return [];
  const { front, coverage, strength = "right" } = spec.defense;
  const alignment = findDefensiveAlignment(spec.variant, front, coverage);
  if (!alignment) {
    warnings.push({
      code: "defense_unknown",
      message: `No catalog match for defense ${front} / ${coverage} (variant ${spec.variant}). Defenders not rendered. Use one of the catalog combinations or call place_defense to synthesize.`,
    });
    return [];
  }
  const positions = alignmentForStrength(alignment, strength);
  return positions.map((p) => ({
    id: p.id,
    role: p.id,
    x: p.x,
    y: p.y,
    team: "D",
  }));
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
        path: pathFromTemplate(template, carrier, variant),
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
 */
function pathFromTemplate(
  template: RouteTemplate,
  carrier: CoachDiagramPlayer,
  variant: SportVariant,
): [number, number][] {
  const fieldWidthYds = sportProfileForVariant(variant).fieldWidthYds;
  // template.points are in normalized template coords (positive x = OUTSIDE).
  // Decide xSign based on which side of the field the carrier is on.
  // CoachDiagram uses yards from CENTER; carrier.x < 0 = left side.
  const xSign = template.directional !== false
    ? (carrier.x >= 0 ? 1 : -1)
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
    const yYds = carrier.y + y * FIELD_LENGTH_YDS;
    return [round(xYds), round(yYds)] as [number, number];
  });
}

function hasCurveSegment(template: RouteTemplate): boolean {
  return (template.shapes ?? []).some((s) => s === "curve");
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
