/**
 * Parser: CoachDiagram → PlaySpec.
 *
 * Extracts the semantic structure (formation, defense, per-player
 * assignments) from a free-form CoachDiagram. Lossless for diagrams
 * authored through the canonical path (route_kind set, place_offense
 * called, place_defense called); falls back to `custom` actions for
 * hand-authored geometry so no information is dropped.
 *
 * Used in two paths:
 *   1. Migration / round-trip: existing CoachDiagrams (already in the
 *      DB as PlayDocuments) get a derived PlaySpec for KB indexing,
 *      notes generation, and validation.
 *   2. Edit flow: when Cal loads an existing play to edit, the spec
 *      gives Cal a high-level handle ("X is on a slant; deepen it to
 *      a dig") instead of asking it to manipulate waypoints.
 */

import type { CoachDiagram, CoachDiagramRoute } from "@/features/coach-ai/coachDiagramConverter";
import type {
  AssignmentAction,
  DefenseRef,
  FormationRef,
  PlayerAssignment,
  PlaySpec,
} from "./spec";
import { PLAY_SPEC_SCHEMA_VERSION } from "./spec";
import type { SportVariant } from "./types";
import { findTemplate } from "./routeTemplates";

const DEFENDER_LABELS = new Set([
  "CB", "LC", "RC", "LCB", "RCB",
  "FS", "SS", "SAFETY", "FSL", "FSR", "SAF", "SA", "SA2",
  "HL", "HR", "HM", "HOOK", "M", "MIKE", "MI",
  "FL", "FR", "FLAT", "WA", "WI",
  "LB", "WLB", "SLB", "MLB", "WILL", "SAM",
  "ILB", "OLB", "WL", "ML", "SL", "BK", "IL", "OL", "BUCK", "MAC",
  "NB", "NICKEL", "STAR", "DIME",
  "DE", "DT", "DL", "NT",
  "S", "B", "T", "G", // unfortunately overlap with offense; team field disambiguates
]);

function normalizeVariant(raw: string | undefined): SportVariant {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("5v5") || v.includes("5x5")) return "flag_5v5";
  if (v.includes("tackle") || v.includes("11")) return "tackle_11";
  if (v.includes("7v7") || v.includes("7x7")) return "flag_7v7";
  return "flag_7v7";
}

/**
 * Parse a CoachDiagram into a PlaySpec.
 *
 * @param diagram The CoachDiagram (yards-based, from Cal or playDocumentToCoachDiagram)
 * @param hints Optional metadata hints from PlayMetadata or the calling context.
 *              When provided, hints take precedence over diagram inference (e.g.
 *              `hints.formation = "Trips Right"` overrides whatever we'd guess
 *              from player layout).
 */
export function coachDiagramToPlaySpec(
  diagram: CoachDiagram,
  hints?: {
    variant?: SportVariant;
    formation?: string;
    defenseFront?: string;
    defenseCoverage?: string;
    notes?: string;
    playType?: "offense" | "defense" | "special_teams";
  },
): PlaySpec {
  const variant = hints?.variant ?? normalizeVariant(diagram.variant);
  const playType = hints?.playType ?? inferPlayType(diagram);

  const formation = inferFormation(diagram, hints);
  const defense = inferDefense(diagram, hints);
  const assignments = buildAssignments(diagram);

  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant,
    title: diagram.title,
    playType,
    formation,
    defense,
    assignments,
    ...(hints?.notes ? { notes: hints.notes } : {}),
  };
}

function inferPlayType(diagram: CoachDiagram): "offense" | "defense" | "special_teams" {
  // If focus is explicitly defense, it's a defense play.
  if (diagram.focus === "D") return "defense";
  // If there are zones AND no offensive routes, treat as defense.
  const offenseRouteCount = (diagram.routes ?? []).filter((r) => {
    const carrier = diagram.players.find((p) => p.id === r.from);
    return carrier && carrier.team !== "D";
  }).length;
  if ((diagram.zones?.length ?? 0) > 0 && offenseRouteCount === 0) return "defense";
  return "offense";
}

/** Infer the formation reference. Hints win; otherwise fall back to the
 *  diagram title (which Cal usually sets to the formation name). When all
 *  signals are absent, return a placeholder — the renderer will then use
 *  synthesizeOffenseFallback. Confidence reflects the source quality. */
function inferFormation(
  diagram: CoachDiagram,
  hints?: { formation?: string },
): FormationRef {
  const explicit = (hints?.formation ?? diagram.title ?? "").trim();
  if (explicit) return { name: explicit, confidence: "high" };
  // Hard fallback — neither hint nor title; renderer will use Spread
  // Doubles. Mark low so downstream surfaces can flag it.
  return { name: "Spread Doubles", confidence: "low" };
}

/** Infer the defense reference. Only present if hints provide it OR the
 *  diagram contains defenders. We do NOT try to reverse-engineer a scheme
 *  name from defender positions — that's a Phase 4+ job (would need a
 *  pose-to-scheme classifier). For now: no inference, just structured
 *  preservation when hints are explicit. */
function inferDefense(
  diagram: CoachDiagram,
  hints?: { defenseFront?: string; defenseCoverage?: string },
): DefenseRef | undefined {
  const front = hints?.defenseFront?.trim();
  const coverage = hints?.defenseCoverage?.trim();
  if (front && coverage) return { front, coverage, confidence: "high" };

  // No hints — only emit a defense ref if defenders exist (so callers
  // know there ARE defenders) and use a placeholder scheme. Renderer
  // will fall back to a generic look. Confidence "low" because we
  // couldn't classify the defenders' positions into a named scheme —
  // a pose classifier (Phase 7+) would upgrade this.
  const hasDefenders = diagram.players.some((p) => p.team === "D" || isDefenderLabel(p.id, p.role));
  if (!hasDefenders) return undefined;
  return { front: "unknown", coverage: "unknown", confidence: "low" };
}

function isDefenderLabel(id: string, role?: string): boolean {
  const u = (role ?? id).toUpperCase();
  return DEFENDER_LABELS.has(u);
}

/** Build a PlayerAssignment[] from the diagram's players + routes. Every
 *  offensive player gets exactly one assignment. Defenders are NOT
 *  assigned actions — their behavior is implied by the defense ref. */
function buildAssignments(diagram: CoachDiagram): PlayerAssignment[] {
  const routesByCarrier = new Map<string, CoachDiagramRoute>();
  for (const r of diagram.routes ?? []) {
    routesByCarrier.set(r.from, r);
  }

  const assignments: PlayerAssignment[] = [];
  for (const p of diagram.players) {
    // Skip explicit defenders. For ambiguous labels (S/B/T/G overlap
    // with offense), respect the team field — the comment in
    // DEFENDER_LABELS said "team field disambiguates" but the original
    // check skipped any matching label REGARDLESS of team, dropping
    // offensive S / B / T players from the spec entirely. Surfaced
    // 2026-05-02 — a Flood with S as the slot was producing zero
    // Curl assignments because S was filtered out.
    if (p.team === "D") continue;
    if (p.team !== "O" && isDefenderLabel(p.id, p.role)) continue;

    const route = routesByCarrier.get(p.id);
    const action = inferAction(p.id, p.role, route, { x: p.x, y: p.y });
    assignments.push({
      player: p.id,
      action,
      confidence: confidenceForAction(action),
    });
  }
  return assignments;
}

/**
 * Confidence policy for parser-derived assignments:
 *   - route (catalog match)  → high — the renderer will produce
 *     deterministic geometry from the catalog.
 *   - block (lineman default) → high — well-known role inference.
 *   - custom                 → low  — preserved waypoints, no semantic
 *     anchor.
 *   - unspecified            → low  — we don't know what this player does.
 *   - carry / motion         → med  — type known but specifics not.
 */
function confidenceForAction(
  action: import("./spec").AssignmentAction,
): import("./spec").Confidence {
  switch (action.kind) {
    case "route":  return "high";
    case "block":  return "high";
    case "carry":  return "med";
    case "motion": return "med";
    case "custom": return "low";
    case "unspecified": return "low";
  }
}

const LINEMAN_IDS = new Set(["LT", "LG", "C", "RG", "RT", "T", "G", "OL"]);
const QB_IDS = new Set(["Q", "QB"]);
const BACK_IDS = new Set(["RB", "B", "F", "FB", "HB", "TB"]);

function inferAction(
  id: string,
  role: string | undefined,
  route: CoachDiagramRoute | undefined,
  carrier?: { x: number; y: number },
): AssignmentAction {
  const uid = (role ?? id).toUpperCase();
  // Strip numeric suffix for category lookup ("Z2" → "Z").
  const baseLabel = uid.replace(/\d+$/, "");

  // Route present → that's the assignment.
  if (route) return actionFromRoute(route, carrier);

  // No route. Infer from position label.
  if (LINEMAN_IDS.has(baseLabel)) return { kind: "block" };
  if (QB_IDS.has(baseLabel)) {
    // QB without an explicit route is most often a passer. We don't
    // have a "pass" action kind in v1 — treat as unspecified. Future
    // PlaySpec versions can add { kind: "pass"; reads: ... }.
    return { kind: "unspecified" };
  }
  if (BACK_IDS.has(baseLabel)) {
    // Back without a route in a pass concept is typically protection;
    // in a run play the back is the carrier. We don't know which from
    // diagram alone — leave unspecified (caller can patch via hints).
    return { kind: "unspecified" };
  }
  // Skill player (X/Y/Z/H/S/F) without a route — uncommon, but possible
  // for jet motion or pure decoy. unspecified is more honest than
  // guessing "block".
  return { kind: "unspecified" };
}

/**
 * Deepest waypoint depth relative to the carrier, in yards. Negative
 * for routes that go BEHIND the LOS (bubble screens). The matcher and
 * concept catalog work in absolute yards — same convention.
 */
function computeDeepestDepth(
  path: ReadonlyArray<readonly [number, number]>,
  carrier: { x: number; y: number },
): number {
  let deepest = 0;
  for (const [, y] of path) {
    const dy = y - carrier.y;
    if (Math.abs(dy) > Math.abs(deepest)) deepest = dy;
  }
  return deepest;
}

function actionFromRoute(
  route: CoachDiagramRoute,
  carrier?: { x: number; y: number },
): AssignmentAction {
  const kind = (route.route_kind ?? "").trim();
  if (kind) {
    const template = findTemplate(kind);
    if (template) {
      // Compute depthYds from the path's deepest waypoint relative to
      // the carrier. Without this, the concept matcher falls back to
      // the catalog family midpoint, which silently rejects concepts
      // (Flood / Curl-Flat) where the concept tightens the depth
      // relative to the family. Surfaced 2026-05-02 — Curl-Flat /
      // Flood would fail concept-match at chat-time even when Cal
      // authored a 5yd Curl correctly, because the parser never
      // preserved the 5yd → spec inferred 8.5yd from catalog mid.
      const depthYds = carrier ? computeDeepestDepth(route.path, carrier) : undefined;
      const action: AssignmentAction = { kind: "route", family: template.name };
      if (depthYds !== undefined && Number.isFinite(depthYds)) {
        return { ...action, depthYds: Math.round(depthYds * 10) / 10 };
      }
      return action;
    }
    // route_kind set but unrecognized — store as custom with the label
    // for round-trip preservation. The validator catches unrecognized
    // kinds at write time, so this branch is mostly defensive.
    return {
      kind: "custom",
      description: `Unrecognized route_kind "${kind}"`,
      waypoints: route.path,
      curve: route.curve,
    };
  }
  // No route_kind — try to infer the route concept from geometry.
  // If inference succeeds, treat it as a regular route. Otherwise,
  // preserve as custom so the geometry isn't lost.
  const inferred = tryInferRouteFamily(route, carrier);
  if (inferred) {
    return inferred;
  }
  return {
    kind: "custom",
    description: "Hand-authored route",
    waypoints: route.path,
    curve: route.curve,
  };
}

/** Try to infer a route family from the path geometry. Returns a route
 *  action if a likely match is found; null otherwise. */
function tryInferRouteFamily(
  route: CoachDiagramRoute,
  carrier?: { x: number; y: number },
): Extract<AssignmentAction, { kind: "route" }> | null {
  if (!route.path || route.path.length < 2) return null;
  if (!carrier) return null;

  // route.path is `[number, number][]` — index [0] = x yards, [1] = y yards.
  // Prior to this fix the function read .x / .y as object properties, which
  // returned undefined on every tuple, made every predicate NaN, and made the
  // entire inference path dead code. Surfaced 2026-05-04: every hand-authored
  // catalog route was being persisted as `kind: "custom"` / "Hand-authored
  // route" instead of the inferred catalog family.
  const waypoints = route.path;
  const start = waypoints[0];
  const end = waypoints[waypoints.length - 1];

  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const depthYds = carrier ? computeDeepestDepth(route.path, carrier) : undefined;

  // Try to match common route families based on direction and depth.
  // This is heuristic-based; exact matches require route_kind.
  const matchTemplates = [
    { name: "Go", predicate: () => dy > dx && depthYds && depthYds > 15 },
    { name: "Post", predicate: () => dy > dx && dx > 2 && depthYds && depthYds >= 10 && depthYds <= 15 },
    { name: "Corner", predicate: () => dy > dx && dx > 3 && depthYds && depthYds >= 10 && depthYds <= 15 },
    { name: "Dig", predicate: () => dy > 5 && dx > 5 && depthYds && depthYds >= 8 && depthYds <= 12 },
    { name: "In", predicate: () => dx > dy && dx > 3 && depthYds && depthYds >= 5 && depthYds <= 10 },
    { name: "Out", predicate: () => dx > dy && dx > 3 && depthYds && depthYds >= 3 && depthYds <= 8 },
    { name: "Slant", predicate: () => dx > 0 && dy > 0 && dx > dy * 0.5 && depthYds && depthYds >= 3 && depthYds <= 7 },
    { name: "Flat", predicate: () => dy < 2 && dx > 3 && depthYds && depthYds < 3 },
    { name: "Hitch", predicate: () => dy > 0 && dy < 6 && dx < 2 && depthYds && depthYds >= 3 && depthYds <= 6 },
  ];

  for (const match of matchTemplates) {
    const template = findTemplate(match.name);
    if (template && match.predicate()) {
      const action: AssignmentAction = { kind: "route", family: template.name };
      if (depthYds !== undefined && Number.isFinite(depthYds)) {
        return { ...action, depthYds: Math.round(depthYds * 10) / 10 } as Extract<AssignmentAction, { kind: "route" }>;
      }
      return action as Extract<AssignmentAction, { kind: "route" }>;
    }
  }

  return null;
}
