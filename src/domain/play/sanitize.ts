/**
 * Defensive renderer pass — sanitizes a CoachDiagram before display so
 * that corrupt schema can NEVER paint the whole field purple, stack
 * players on top of each other, or render routes that fly off the
 * field. The sanitizer is the second half of the AGENTS.md "make it
 * impossible, then validate" rule: validators reject obvious mistakes
 * BEFORE they ship; the sanitizer makes sure that anything that DOES
 * slip through (off-catalog edits, future schema additions, model
 * confabulation) is silently clamped or dropped instead of corrupting
 * the visual.
 *
 * Sanitization passes (each pass is independent and idempotent):
 *   1. Drop zones whose center / size contain non-finite numbers.
 *   2. Drop zones whose size exceeds the field bounds for the variant
 *      (a 1000×1000 zone paints the whole field; that's image 3 from
 *      2026-05-02). Fall-back hard cap = field width × 30yd downfield.
 *   3. Clamp zone centers to within the field — a zone centered at
 *      x=200 on a 25yd-wide field is corrupt regardless of its size.
 *   4. Drop players whose x / y are non-finite.
 *   5. Drop players whose position is far outside the field — > 1.5×
 *      half-width laterally, > 30yd downfield, > 15yd behind the LOS.
 *   6. Resolve player position overlaps within 0.3yd by nudging the
 *      second occurrence along the x-axis. Skip OL pairs (LT/LG/C/RG/
 *      RT) — their natural splits are tight and the existing OL
 *      validator already enforces the spec there.
 *   7. Drop routes whose carrier doesn't exist in players[].
 *   8. Drop routes whose path is empty AND whose motion is empty.
 *   9. Drop routes whose path contains non-finite waypoints.
 *  10. Clamp route waypoints to a generous bounding box (±2× half-
 *      width, -10yd to +35yd downfield) so a stray "y=400" point can't
 *      break the SVG transform.
 *
 * The function returns BOTH the sanitized diagram AND a list of
 * warnings describing what changed. Callers (renderer, chat-time
 * validator) decide what to do with the warnings — the renderer logs
 * them; the validator can choose to surface them to Cal as a soft
 * "your diagram had X corrupt elements that I dropped" notice.
 *
 * IMPORTANT: the sanitizer is PURE — given the same input, it always
 * returns the same output. No randomness, no I/O, no time dependence.
 * Tests rely on this for reproducible goldens.
 */

import { sportProfileForVariant } from "./factory";
import type { SportVariant } from "./types";
import type {
  CoachDiagram,
  CoachDiagramPlayer,
  CoachDiagramRoute,
  CoachDiagramZone,
} from "@/features/coach-ai/coachDiagramConverter";

/** A single transformation the sanitizer applied. Surfaced for
 *  debugging + chat-time observability. */
export type SanitizeWarning = {
  /** Stable identifier — tests assert on this. New codes get added,
   *  existing ones never get repurposed. */
  code:
    | "zone_dropped_nonfinite"
    | "zone_dropped_oversized"
    | "zone_center_clamped"
    | "player_dropped_nonfinite"
    | "player_dropped_out_of_bounds"
    | "player_overlap_nudged"
    | "route_dropped_unknown_carrier"
    | "route_dropped_empty_path"
    | "route_dropped_nonfinite_waypoint"
    | "route_waypoint_clamped";
  /** Human-readable description for logging. */
  message: string;
  /** Subject of the warning — player id, route carrier id, etc. */
  subject?: string;
};

export type SanitizeResult = {
  diagram: CoachDiagram;
  warnings: SanitizeWarning[];
};

/** Heuristic check that a number is a real coordinate, not NaN /
 *  Infinity / null / undefined. */
function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** OL ids — exempt from the overlap-nudge pass since real splits are
 *  tight and the OL validator already guarantees correct spacing. */
const OL_IDS = new Set(["LT", "LG", "C", "RG", "RT", "T", "G", "OL"]);

/** Sanitize a CoachDiagram. Pure function. */
export function sanitizeCoachDiagram(
  input: CoachDiagram,
  variantOverride?: SportVariant,
): SanitizeResult {
  const warnings: SanitizeWarning[] = [];

  // Resolve variant. Prefer the explicit override; fall back to the
  // diagram's own variant field; default to flag_7v7 (the most common
  // case) if neither is present. The variant determines field bounds
  // for clamping decisions.
  const variantStr = variantOverride ?? (input.variant as SportVariant | undefined) ?? "flag_7v7";
  const profile = sportProfileForVariant(variantStr);
  const halfWidthYds = profile.fieldWidthYds / 2;
  // Hard caps on what counts as "on the field". Generous so that
  // legitimate plays (deep verts to 18yd, RB releases to 8yd behind
  // the LOS) pass without warning.
  const PLAYER_BOUNDS = {
    xMin: -halfWidthYds * 1.5,
    xMax:  halfWidthYds * 1.5,
    yMin: -15, // 15yd behind the LOS — generous for deep shotgun
    yMax:  30, // 30yd downfield — beyond catalog's deepest verts
  };
  // Route waypoints get a slightly larger envelope; legitimate routes
  // can momentarily fly outside player bounds during a curl
  // intermediate.
  const ROUTE_BOUNDS = {
    xMin: -halfWidthYds * 2,
    xMax:  halfWidthYds * 2,
    yMin: -10,
    yMax:  35,
  };
  // Zone size cap: a single zone shouldn't exceed the field's
  // dimensions. Anything bigger paints the whole field — exactly the
  // image-3 corruption case.
  const ZONE_MAX_W = profile.fieldWidthYds;
  const ZONE_MAX_H = 30;

  // ── Players ──────────────────────────────────────────────────────────
  const cleanPlayers: CoachDiagramPlayer[] = [];
  const droppedPlayerIds = new Set<string>();
  for (const p of input.players ?? []) {
    if (!p || typeof p !== "object") continue;
    if (typeof p.id !== "string" || p.id.length === 0) continue;

    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
      droppedPlayerIds.add(p.id);
      warnings.push({
        code: "player_dropped_nonfinite",
        subject: p.id,
        message: `@${p.id} has non-finite x/y (x=${p.x}, y=${p.y}); dropped from diagram.`,
      });
      continue;
    }
    if (
      p.x < PLAYER_BOUNDS.xMin || p.x > PLAYER_BOUNDS.xMax ||
      p.y < PLAYER_BOUNDS.yMin || p.y > PLAYER_BOUNDS.yMax
    ) {
      droppedPlayerIds.add(p.id);
      warnings.push({
        code: "player_dropped_out_of_bounds",
        subject: p.id,
        message: `@${p.id} at (x=${p.x}, y=${p.y}) is outside the ${variantStr} field; dropped from diagram.`,
      });
      continue;
    }
    cleanPlayers.push({ ...p });
  }

  // Resolve overlaps. Two non-OL players within 0.3yd — nudge the
  // second one outward by 1.0yd. Stable order: by index, so the
  // result is deterministic.
  const NUDGE_THRESHOLD = 0.3;
  const NUDGE_DISTANCE  = 1.0;
  for (let i = 0; i < cleanPlayers.length; i++) {
    const a = cleanPlayers[i];
    if (OL_IDS.has(a.id.toUpperCase())) continue;
    for (let j = i + 1; j < cleanPlayers.length; j++) {
      const b = cleanPlayers[j];
      if (a.team !== b.team) continue; // offense + defense overlap is allowed (mirroring)
      if (OL_IDS.has(b.id.toUpperCase())) continue;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx <= NUDGE_THRESHOLD && dy <= NUDGE_THRESHOLD) {
        // Nudge b outward away from center on the x-axis. If b is at
        // x=0, nudge right.
        const sign = b.x >= 0 ? 1 : -1;
        const nudgedX = b.x + sign * NUDGE_DISTANCE;
        warnings.push({
          code: "player_overlap_nudged",
          subject: b.id,
          message: `@${b.id} overlapped @${a.id} at (${a.x}, ${a.y}); nudged x to ${nudgedX.toFixed(1)}.`,
        });
        cleanPlayers[j] = { ...b, x: nudgedX };
      }
    }
  }

  // ── Zones ────────────────────────────────────────────────────────────
  const cleanZones: CoachDiagramZone[] = [];
  for (const z of input.zones ?? []) {
    if (!z || typeof z !== "object") continue;
    const c = z.center;
    const s = z.size;
    if (
      !Array.isArray(c) || c.length !== 2 ||
      !Array.isArray(s) || s.length !== 2 ||
      !isFiniteNumber(c[0]) || !isFiniteNumber(c[1]) ||
      !isFiniteNumber(s[0]) || !isFiniteNumber(s[1])
    ) {
      warnings.push({
        code: "zone_dropped_nonfinite",
        subject: z.label ?? "(unlabeled)",
        message: `zone "${z.label ?? "(unlabeled)"}" has non-finite center or size; dropped.`,
      });
      continue;
    }
    if (s[0] <= 0 || s[1] <= 0) {
      warnings.push({
        code: "zone_dropped_nonfinite",
        subject: z.label ?? "(unlabeled)",
        message: `zone "${z.label ?? "(unlabeled)"}" has non-positive size [${s[0]}, ${s[1]}]; dropped.`,
      });
      continue;
    }
    if (s[0] > ZONE_MAX_W || s[1] > ZONE_MAX_H) {
      warnings.push({
        code: "zone_dropped_oversized",
        subject: z.label ?? "(unlabeled)",
        message:
          `zone "${z.label ?? "(unlabeled)"}" size [${s[0]}, ${s[1]}] exceeds field bounds ` +
          `[${ZONE_MAX_W}, ${ZONE_MAX_H}] for ${variantStr}; dropped to prevent painting the entire field.`,
      });
      continue;
    }
    // Clamp center if it's wildly off-field. Conservative — only
    // clamp when the center is clearly outside the play area, since
    // legitimate zones can have centers in the deep parts of the
    // field.
    let center: [number, number] = [c[0], c[1]];
    let centerClamped = false;
    if (Math.abs(c[0]) > halfWidthYds * 1.2) {
      center = [Math.sign(c[0]) * halfWidthYds, center[1]];
      centerClamped = true;
    }
    if (c[1] < -10 || c[1] > 30) {
      center = [center[0], Math.max(-10, Math.min(30, c[1]))];
      centerClamped = true;
    }
    if (centerClamped) {
      warnings.push({
        code: "zone_center_clamped",
        subject: z.label ?? "(unlabeled)",
        message: `zone "${z.label ?? "(unlabeled)"}" center clamped from [${c[0]}, ${c[1]}] to [${center[0]}, ${center[1]}].`,
      });
    }
    cleanZones.push({ ...z, center });
  }

  // ── Routes ───────────────────────────────────────────────────────────
  const playerIds = new Set(cleanPlayers.map((p) => p.id));
  const cleanRoutes: CoachDiagramRoute[] = [];
  for (const r of input.routes ?? []) {
    if (!r || typeof r !== "object" || typeof r.from !== "string") continue;
    if (!playerIds.has(r.from)) {
      warnings.push({
        code: "route_dropped_unknown_carrier",
        subject: r.from,
        message: `route from @${r.from} dropped — carrier not in players[] (dropped earlier or never present).`,
      });
      continue;
    }
    const path = Array.isArray(r.path) ? r.path : [];
    const motion = Array.isArray(r.motion) ? r.motion : [];
    if (path.length === 0 && motion.length === 0) {
      warnings.push({
        code: "route_dropped_empty_path",
        subject: r.from,
        message: `route from @${r.from} has empty path AND empty motion; dropped (a route must have at least one waypoint).`,
      });
      continue;
    }
    let nonFiniteHit = false;
    const cleanPath: [number, number][] = [];
    for (const wp of path) {
      if (!Array.isArray(wp) || wp.length !== 2 || !isFiniteNumber(wp[0]) || !isFiniteNumber(wp[1])) {
        nonFiniteHit = true;
        break;
      }
      let x = wp[0];
      let y = wp[1];
      if (x < ROUTE_BOUNDS.xMin || x > ROUTE_BOUNDS.xMax || y < ROUTE_BOUNDS.yMin || y > ROUTE_BOUNDS.yMax) {
        const clamped: [number, number] = [
          Math.max(ROUTE_BOUNDS.xMin, Math.min(ROUTE_BOUNDS.xMax, x)),
          Math.max(ROUTE_BOUNDS.yMin, Math.min(ROUTE_BOUNDS.yMax, y)),
        ];
        warnings.push({
          code: "route_waypoint_clamped",
          subject: r.from,
          message: `route from @${r.from} had waypoint (${x}, ${y}) outside the field; clamped to (${clamped[0]}, ${clamped[1]}).`,
        });
        x = clamped[0];
        y = clamped[1];
      }
      cleanPath.push([x, y]);
    }
    if (nonFiniteHit) {
      warnings.push({
        code: "route_dropped_nonfinite_waypoint",
        subject: r.from,
        message: `route from @${r.from} had non-finite waypoint(s); dropped entirely.`,
      });
      continue;
    }
    cleanRoutes.push({ ...r, path: cleanPath });
  }

  return {
    diagram: {
      ...input,
      players: cleanPlayers,
      routes: cleanRoutes,
      zones: cleanZones,
    },
    warnings,
  };
}
