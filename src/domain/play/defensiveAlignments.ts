/**
 * Canonical defensive alignments — deterministic positions for common
 * (front, coverage) combinations.
 *
 * Why this exists: when Coach Cal freehands defensive players, it routinely
 * produces broken looks (two CBs on the same side, LBs stacked on top of
 * D-line, safeties at QB-depth). Forcing the AI to pick a NAMED scheme and
 * then having code place the players makes the defense legal by construction.
 *
 * Coordinate system matches the CoachDiagram format the AI emits:
 *   x = yards from center  (negative = LEFT side, positive = RIGHT side)
 *   y = yards from LOS     (positive = downfield / defense's side)
 *
 * "Strength" controls which side the defense rotates toward. The catalog
 * is authored as if strength = "right"; for "left" we mirror x.
 */
/**
 * Per-defender assignment within a canonical (front, coverage) entry.
 *
 * Replaces the coarse `manCoverage: boolean` flag with a structured
 * description of WHAT each defender is doing. This is what makes Cover 1
 * render correctly: FS plays a zone (deep middle) while every other
 * defender is in man — a coverage-wide boolean can't express that.
 *
 * Kinds:
 *   - `zone`  — defender drops into a named zone (looked up by `zoneId`
 *               in the alignment's `zones[]`).
 *   - `man`   — defender matches a specific receiver. `target` is a
 *               receiver id like "X" / "Z" / "TE" / "RB" / "#1" (slot
 *               relative to formation strength). When unset, the
 *               renderer/notes layer infers the target by leverage.
 *   - `blitz` — defender rushes the QB through `gap`. Not all entries
 *               include blitzers; this is the override slot.
 *   - `spy`   — defender mirrors a specific offensive player (usually
 *               the QB or a dynamic back).
 *
 * `unspecified` is intentionally NOT a kind — every defender in the
 * catalog must have a concrete role. The validator (Phase D4) rejects
 * any entry with a missing or unknown assignment.
 */
export type DefenderAssignmentSpec =
  | { kind: "zone"; zoneId: string }
  | { kind: "man"; target?: string }
  | { kind: "blitz"; gap?: "A" | "B" | "C" | "D" | "edge" }
  | { kind: "spy"; target?: string };

export type DefensiveAlignmentPlayer = {
  /** Short label (≤2 chars) shown inside the triangle. */
  id: string;
  x: number;
  y: number;
  /**
   * What this defender is doing. New in the per-defender model. Optional
   * on legacy entries; new entries MUST set it. Read via
   * `getDefenderAssignmentDefault(player, alignment)` to fall back to
   * the alignment-level `manCoverage` boolean for legacy compatibility.
   */
  assignment?: DefenderAssignmentSpec;
};

/**
 * Canonical zone shape attached to a (front, coverage) entry. Yards, authored
 * for strength="right" (mirrors with the players when strength flips). Same
 * fields as `CoachDiagramZone` so the AI tool can pass them straight through.
 */
export type DefensiveAlignmentZone = {
  /**
   * Stable id for cross-referencing from per-defender `zone` assignments.
   * Required when any defender's `assignment.kind === "zone"` references it.
   * Convention: snake_case role name — `deep_middle`, `deep_third_l`,
   * `hook_l`, `flat_r`, etc.
   */
  id?: string;
  kind: "rectangle" | "ellipse";
  /** Center of the zone in yards. */
  center: [number, number];
  /** FULL width and height in yards. */
  size: [number, number];
  /** Short label drawn inside the zone (e.g. "Deep third L"). */
  label: string;
};

export type DefensiveAlignment = {
  /** Front name as a coach would say it. */
  front: string;
  /** Coverage name as a coach would say it. */
  coverage: string;
  /** Sport variant this alignment is sized for. */
  variant: "tackle_11" | "flag_7v7" | "flag_6v6" | "flag_5v5";
  /** Plain-English summary the AI can echo back to the coach. */
  description: string;
  /** Players in canonical positions, authored for strength="right". */
  players: DefensiveAlignmentPlayer[];
  /**
   * Zone shapes — only meaningful when `manCoverage !== true`. Same coord
   * system as `players`. Optional: legacy alignments without zones simply
   * render dots only.
   */
  zones?: DefensiveAlignmentZone[];
  /**
   * True for pure-man coverages (Cover 0, Cover 1 with man on every receiver,
   * 7v7 Man). Suppresses zone rendering and tells the AI to draw assignment
   * lines (defender → receiver) instead.
   */
  manCoverage?: boolean;
};

// ── Defensive alignments ───────────────────────────────────────────────────
//
// Sourced from the Football Knowledge Graph (Phase 1d, 2026-05-24). The 19
// alignment entries used to live inline here as TypeScript const declarations
// (T11 × 7, F7 × 6, F6 × 4, F5 × 2); they now live as KG defs in
// src/domain/football-kg/defs/schemes.ts and are projected to legacy shape
// via `projectSchemesToLegacy()`. Byte-equality with the prior inline data
// is verified by src/domain/football-kg/defs/legacy-byte-equality.test.ts.

import { projectSchemesToLegacy } from "@/domain/football-kg/legacy-projections";

export const DEFENSIVE_ALIGNMENTS: DefensiveAlignment[] = projectSchemesToLegacy() as unknown as DefensiveAlignment[];

// ── Legacy inline entries removed 2026-05-24 — see Football KG ─────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function findDefensiveAlignment(
  variant: string,
  front: string,
  coverage: string,
): DefensiveAlignment | null {
  const v = norm(variant);
  const f = norm(front);
  const c = norm(coverage);
  return (
    DEFENSIVE_ALIGNMENTS.find(
      (a) => norm(a.variant) === v && norm(a.front) === f && norm(a.coverage) === c,
    ) ?? null
  );
}

export function listDefensiveAlignments(variant: string): DefensiveAlignment[] {
  const v = norm(variant);
  return DEFENSIVE_ALIGNMENTS.filter((a) => norm(a.variant) === v);
}

/**
 * Mirror an alignment to the requested strength side. The catalog is authored
 * as if strength = "right"; for "left" we negate x on every player.
 *
 * Note: per-defender `assignment` is preserved verbatim. Zone IDs are
 * stable across mirror (the zone's own coords are mirrored separately by
 * `zonesForStrength`).
 */
export function alignmentForStrength(
  alignment: DefensiveAlignment,
  strength: "left" | "right",
): DefensiveAlignmentPlayer[] {
  if (strength === "right") return alignment.players;
  return alignment.players.map((p) => ({ ...p, x: -p.x }));
}

/**
 * Resolve the per-defender assignment for a player in an alignment, falling
 * back to a sensible default for legacy entries that don't yet set
 * `assignment` on every player.
 *
 * Fallback policy:
 *   - If the alignment is `manCoverage: true` and there are no zones, the
 *     defender is in man on a generic target.
 *   - If the alignment has zones but no man, the defender drops into the
 *     zone whose center is closest to its position (best-effort).
 *   - Otherwise the defender is in man (the safest "do nothing structural"
 *     fallback, since most legacy entries without zones are man looks).
 *
 * Validators (Phase D4) reject any catalog entry where this fallback is
 * required — but at runtime, consumers can read assignments without
 * guarding against undefined.
 */
export function getDefenderAssignmentDefault(
  player: DefensiveAlignmentPlayer,
  alignment: DefensiveAlignment,
): DefenderAssignmentSpec {
  if (player.assignment) return player.assignment;
  const zones = alignment.zones ?? [];
  if (alignment.manCoverage || zones.length === 0) {
    return { kind: "man" };
  }
  // Pick the zone with the closest center to the player.
  let best = zones[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const z of zones) {
    const dx = z.center[0] - player.x;
    const dy = z.center[1] - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best.id ? { kind: "zone", zoneId: best.id } : { kind: "man" };
}

/**
 * Returns the alignment's defenders with each one's resolved assignment
 * attached. Convenience for renderers/notes that don't want to call
 * `getDefenderAssignmentDefault` per player.
 */
export function alignmentWithAssignments(
  alignment: DefensiveAlignment,
  strength: "left" | "right" = "right",
): Array<DefensiveAlignmentPlayer & { assignment: DefenderAssignmentSpec }> {
  const players = alignmentForStrength(alignment, strength);
  return players.map((p) => ({
    ...p,
    assignment: getDefenderAssignmentDefault(p, alignment),
  }));
}

/**
 * Look up a zone by id within an alignment. Optionally mirrors for strength.
 */
export function findZoneById(
  alignment: DefensiveAlignment,
  zoneId: string,
  strength: "left" | "right" = "right",
): DefensiveAlignmentZone | null {
  const zones = zonesForStrength(alignment, strength);
  return zones.find((z) => z.id === zoneId) ?? null;
}

export function zonesForStrength(
  alignment: DefensiveAlignment,
  strength: "left" | "right",
): DefensiveAlignmentZone[] {
  const zones = alignment.zones ?? [];
  if (strength === "right") return zones;
  return zones.map((z) => ({
    ...z,
    center: [-z.center[0], z.center[1]],
  }));
}
