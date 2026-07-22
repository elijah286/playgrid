/**
 * Photo-import synthesis: PlayExtraction → PlaySpec.
 *
 * Deterministic TypeScript, no LLM. The vision model named semantics
 * (formation, route families, depths); this module lands them on the
 * canonical PlaySpec so the play rides the existing resolver → renderer
 * → sanitizer path (AGENTS.md Rules 2/4/10) and is exactly as
 * well-formed as a Cal-composed play.
 *
 * The two design problems this module owns:
 *
 * 1. FORMATION SNAP. Specs reference formations by name; the renderer
 *    synthesizes player positions from that name. We try the model's
 *    formation call first, then a receiver-distribution-derived guess,
 *    then Spread Doubles — the first candidate the synthesizer accepts
 *    wins, and anything past the first candidate is surfaced as a
 *    warning for the review UI.
 *
 * 2. PLAYER MAPPING. The sheet's letters (X/Y/Z/A/B...) rarely match
 *    the catalog roster's slot ids. Both sides are sorted left-to-right
 *    (sheet: orderFromLeft; roster: x) and zipped. The mapping is
 *    returned so the review UI can show "sheet A → diagram H" and keep
 *    the coach oriented. We deliberately do NOT relabel diagram players
 *    to sheet letters: spec assignments must reference roster ids
 *    (spec.ts invariant 1), and a renamed diagram would diverge from
 *    the spec that re-renders it.
 *
 * Depth handling: values are clamped into the family's catalog range
 * (and under the playbook's max-throw cap when set) BEFORE the spec is
 * built, with a warning per adjustment — an import should never
 * dead-end on a validator reject the coach can't see coming.
 */

import { synthesizeOffense } from "@/domain/play/offensiveSynthesize";
import { findTemplate } from "@/domain/play/routeTemplates";
import { sportProfileForVariant } from "@/domain/play/factory";
import type { PlaySpec, PlayerAssignment, AssignmentAction, RouteModifier, Confidence } from "@/domain/play/spec";
import { PLAY_SPEC_SCHEMA_VERSION } from "@/domain/play/spec";
import type { SportVariant } from "@/domain/play/types";
import { sanitizeCoachDiagram } from "@/domain/play/sanitize";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import type { ExtractedAssignment, ExtractedPlayer, PlayExtraction } from "./schema";

export type ImportWarning = {
  code:
    | "formation_fallback"
    | "formation_unresolved"
    | "player_count_mismatch"
    | "player_mapping_cross_depth"
    | "player_unmapped"
    | "player_unassigned"
    | "family_unknown"
    | "depth_raised"
    | "depth_capped"
    | "depth_over_throw_cap"
    | "assignment_skipped";
  message: string;
};

export type PlayerMapping = {
  sheetLabel: string;
  rosterId: string;
  /** The sheet circle's printed color name (extraction vocabulary) —
   *  drives draft recoloring via applySheetIdentity. */
  sheetColor?: string;
  /** Target starting position in field yards (x from center, y from
   *  LOS), derived from the photo's alignment buckets. Applied to the
   *  rendered diagram by applyPhotoAlignment — "players start where
   *  the photo shows them" is the first thing a coach checks. */
  align?: { x: number; y: number };
  /** Where the route launches from when pre-snap motion carries the
   *  player somewhere else first (jet motion). Drawn as the dashed
   *  motion zig-zag from `align` to here; the route path anchors here. */
  routeStartAt?: { x: number; y: number };
};

export type SynthesisResult = {
  spec: PlaySpec;
  warnings: ImportWarning[];
  /** sheet letter → roster slot id, in left-to-right sheet order. */
  mapping: PlayerMapping[];
};

const ROUTE_MODIFIERS: readonly RouteModifier[] = [
  "hot",
  "sit_vs_zone",
  "option",
  "motion",
  "delayed",
  "rub",
  "alert",
];

function isRouteModifier(value: string): value is RouteModifier {
  return (ROUTE_MODIFIERS as readonly string[]).includes(value);
}

/** Roster ids that are never mapping targets: the snap/QB pair plus
 *  tackle-11 interior line. Everything else is a skill slot. */
const NON_SKILL_ROSTER_IDS = new Set(["QB", "C", "LT", "LG", "RG", "RT"]);

function isSheetSpecialLabel(label: string): boolean {
  const l = label.trim().toUpperCase();
  return l === "C" || l === "Q" || l === "QB";
}

/** Observed skill players (no C/Q), sorted left-to-right as drawn. */
export function observedSkillPlayers(extraction: PlayExtraction): ExtractedPlayer[] {
  return extraction.players
    .filter((p) => !isSheetSpecialLabel(p.label))
    .slice()
    .sort((a, b) => a.orderFromLeft - b.orderFromLeft);
}

/** Ordered formation-name candidates: the model's call (with strength
 *  suffix variant), a receiver-distribution guess, then the default. */
export function formationCandidates(extraction: PlayExtraction): string[] {
  const candidates: string[] = [];
  const push = (name: string | undefined | null) => {
    const n = name?.trim();
    if (n && !candidates.some((c) => c.toLowerCase() === n.toLowerCase())) candidates.push(n);
  };

  const named = extraction.formation.name;
  push(named);
  const strength = extraction.formation.strength;
  if (named && strength && strength !== "balanced" && !/\b(left|right|strong|weak)\b/i.test(named)) {
    push(`${named} ${strength === "left" ? "Left" : "Right"}`);
  }

  const skill = observedSkillPlayers(extraction);
  const left = skill.filter((p) => p.side === "left").length;
  const right = skill.filter((p) => p.side === "right").length;
  if (left >= 3 && right <= 2) push("Trips Left");
  else if (right >= 3 && left <= 2) push("Trips Right");

  push("Spread Doubles");
  return candidates;
}

type RosterSlot = { id: string; x: number; y: number };

function rosterSkillSlots(variant: SportVariant, formationName: string): RosterSlot[] | null {
  const synth = synthesizeOffense(variant, formationName);
  if (!synth) return null;
  return synth.players
    .filter((p) => !NON_SKILL_ROSTER_IDS.has(p.id))
    .map((p) => ({ id: p.id, x: p.x, y: p.y }))
    .sort((a, b) => a.x - b.x);
}

/** Roster y at or below this is a backfield slot (backs sit -4..-6;
 *  wings/slots sit 0..-1). */
const BACKFIELD_Y = -1.5;

type WidthBucket = "wide" | "slot" | "tight" | "middle";

/** Alignment buckets → field yards. Deterministic, stylized spacing —
 *  the same philosophy as the formation synthesizer, driven by the
 *  photo's observed structure instead of a formation name. */
function bucketX(side: "left" | "right" | "center", width: WidthBucket, halfWidthYds: number): number {
  if (side === "center" || width === "middle") return 0;
  const mag = width === "tight" ? 3 : width === "slot" ? 6.5 : Math.max(8, halfWidthYds - 3.5);
  return side === "left" ? -mag : mag;
}

function bucketY(p: { onLos: boolean; backfield: boolean }): number {
  return p.onLos ? 0 : p.backfield ? -4.5 : -1.2;
}

/** Width fallback for extractions that omitted the bucket: outermost
 *  player on a side reads as wide, inner players as slot. */
function widthWithFallback(p: ExtractedPlayer, sameSide: ExtractedPlayer[]): WidthBucket {
  if (p.width) return p.width;
  if (p.side === "center") return "middle";
  const orders = sameSide.map((s) => s.orderFromLeft);
  const isOutermost =
    p.side === "left" ? p.orderFromLeft === Math.min(...orders) : p.orderFromLeft === Math.max(...orders);
  return isOutermost ? "wide" : "slot";
}

/**
 * How well the photographed play fits the playbook's variant. The first
 * prod test imported a 7v7 sheet into a 5v5 playbook and got garbage by
 * construction — routes force-mapped onto a roster with 2 fewer
 * receivers. |delta| >= 2 should hard-stop the import with a "wrong
 * playbook?" prompt; |delta| == 1 is more likely a read miss (a missed
 * receiver) and proceeds with the count-mismatch warning.
 */
export function variantFit(
  extraction: PlayExtraction,
  variant: SportVariant,
): { observedSkill: number; expectedSkill: number; photoPlayers: number; expectedPlayers: number; delta: number } {
  const expectedPlayers = sportProfileForVariant(variant).offensePlayerCount;
  const expectedSkill = Math.max(0, expectedPlayers - 2); // minus C + Q
  const observedSkill = observedSkillPlayers(extraction).length;
  return {
    observedSkill,
    expectedSkill,
    expectedPlayers,
    photoPlayers: Math.max(extraction.players.length, observedSkill + 2),
    delta: observedSkill - expectedSkill,
  };
}

/**
 * The canonical variant for a photographed play with `count` offensive
 * players on the field (C + QB + skill). This is the inverse of
 * `sportProfileForVariant(...).offensePlayerCount`, used when a photo
 * doesn't fit the current playbook so we can offer the coach a
 * correctly-formatted home for the play (a new or existing playbook of
 * the matching size).
 *
 * Two counts are ambiguous — 6 (flag_6v6 / "other") and 7 (flag_7v7 /
 * touch_7v7) — because the difference between those pairs is field size
 * or rules, not roster. We resolve each to its most common flag variant;
 * "compatible playbook" matching is done by player COUNT downstream, so a
 * touch_7v7 playbook still qualifies as a target for a 7-player play.
 * Returns null for counts no supported variant provides (e.g. 8, 9, 10).
 */
export function variantForOffenseCount(count: number): SportVariant | null {
  switch (count) {
    case 4:
      return "flag_4v4";
    case 5:
      return "flag_5v5";
    case 6:
      return "flag_6v6";
    case 7:
      return "flag_7v7";
    case 11:
      return "tackle_11";
    default:
      return null;
  }
}

function buildRouteAction(
  extracted: ExtractedAssignment,
  sheetLabel: string,
  maxThrowDepthYds: number | null | undefined,
  warnings: ImportWarning[],
): AssignmentAction {
  const template = extracted.family ? findTemplate(extracted.family) : null;
  if (!template) {
    warnings.push({
      code: "family_unknown",
      message: `${sheetLabel}: route family "${extracted.family ?? "(none)"}" isn't in the catalog — imported as unassigned. Pick a route in the review step.`,
    });
    return { kind: "unspecified" };
  }

  const { min, max } = template.constraints.depthRangeYds;
  let depthYds =
    typeof extracted.depthYds === "number" && Number.isFinite(extracted.depthYds)
      ? Math.round(extracted.depthYds)
      : undefined;
  let nonCanonical = false;

  if (depthYds !== undefined) {
    if (depthYds < min) {
      warnings.push({
        code: "depth_raised",
        message: `${sheetLabel}: ${template.name} read at ${depthYds} yd — ${template.name}s run ${min}-${max} yd, raised to ${min}.`,
      });
      depthYds = min;
    } else if (depthYds > max) {
      warnings.push({
        code: "depth_capped",
        message: `${sheetLabel}: ${template.name} read at ${depthYds} yd — ${template.name}s run ${min}-${max} yd, capped at ${max}. If the drawing really goes deeper, a different family may fit better.`,
      });
      depthYds = max;
    }
  }

  if (
    typeof maxThrowDepthYds === "number" &&
    Number.isFinite(maxThrowDepthYds) &&
    depthYds !== undefined &&
    depthYds > maxThrowDepthYds
  ) {
    if (maxThrowDepthYds < min) {
      // The playbook's throw cap sits below the family's floor. Honor
      // the cap (it's coach-stated) and mark the route nonCanonical —
      // that flag exists exactly for legitimate off-catalog depths.
      warnings.push({
        code: "depth_over_throw_cap",
        message: `${sheetLabel}: ${template.name} capped at this playbook's ${maxThrowDepthYds}-yd max throw depth (family normally runs ${min}+).`,
      });
      depthYds = Math.round(maxThrowDepthYds);
      nonCanonical = true;
    } else {
      warnings.push({
        code: "depth_over_throw_cap",
        message: `${sheetLabel}: ${template.name} read at ${depthYds} yd — capped at this playbook's ${maxThrowDepthYds}-yd max throw depth.`,
      });
      depthYds = Math.round(maxThrowDepthYds);
    }
  }

  const modifiers = (extracted.modifiers ?? []).filter(isRouteModifier);

  return {
    kind: "route",
    family: template.name,
    ...(depthYds !== undefined ? { depthYds } : {}),
    ...(extracted.direction ? { direction: extracted.direction } : {}),
    ...(modifiers.length > 0 ? { modifiers } : {}),
    ...(nonCanonical ? { nonCanonical: true } : {}),
  };
}

function buildAction(
  extracted: ExtractedAssignment,
  sheetLabel: string,
  maxThrowDepthYds: number | null | undefined,
  warnings: ImportWarning[],
): AssignmentAction {
  switch (extracted.kind) {
    case "route":
      return buildRouteAction(extracted, sheetLabel, maxThrowDepthYds, warnings);
    case "carry":
      // A photographed carry is almost always a jet sweep / handoff
      // track; the renderer synthesizes a sensible default path from
      // runType when no waypoints are supplied.
      return { kind: "carry", runType: "sweep" };
    case "block":
      return { kind: "block" };
    case "motion":
      return { kind: "motion" };
    case "unclear":
      warnings.push({
        code: "player_unassigned",
        message: `${sheetLabel}: the drawn path couldn't be read${extracted.evidence ? ` (${extracted.evidence})` : ""} — imported as unassigned. Set a route in the review step.`,
      });
      return { kind: "unspecified" };
  }
}

export function synthesizePlaySpec(
  extraction: PlayExtraction,
  opts: {
    variant: SportVariant;
    /** Playbook's persistent max-throw-depth setting, when configured. */
    maxThrowDepthYds?: number | null;
    title?: string;
  },
): SynthesisResult {
  const warnings: ImportWarning[] = [];

  // ── 1. Formation snap ────────────────────────────────────────────
  const candidates = formationCandidates(extraction);
  let formationName: string | null = null;
  let roster: RosterSlot[] | null = null;
  for (const candidate of candidates) {
    const slots = rosterSkillSlots(opts.variant, candidate);
    if (slots) {
      formationName = candidate;
      roster = slots;
      break;
    }
  }
  if (!formationName || !roster) {
    // Should be unreachable (Spread Doubles parses for every variant),
    // but never crash an import over it.
    formationName = "Spread Doubles";
    roster = rosterSkillSlots(opts.variant, formationName) ?? [];
    warnings.push({
      code: "formation_unresolved",
      message: `No formation candidate parsed for variant ${opts.variant}; defaulted to Spread Doubles.`,
    });
  } else if (candidates[0] && formationName !== candidates[0]) {
    warnings.push({
      code: "formation_fallback",
      message: `Formation "${candidates[0]}" isn't a recognized alignment — imported as "${formationName}". Adjust in the review step if that's wrong.`,
    });
  }

  // ── 2. Player mapping (sheet letters → roster slots) ─────────────
  // Depth-aware pairing: backfield players map to backfield slots and
  // line players to line slots, each group left-to-right. A flat
  // left-to-right zip across both groups put an offset back on an
  // on-LOS slot (and pushed a line receiver into the backfield) in the
  // first prod test (2026-07-03), scrambling every downstream route.
  const observed = observedSkillPlayers(extraction);
  if (observed.length !== roster.length) {
    warnings.push({
      code: "player_count_mismatch",
      message: `The photo shows ${observed.length} route-running players but a ${opts.variant} ${formationName} has ${roster.length} skill slots — extra ${observed.length > roster.length ? "sheet players were dropped" : "slots were left unassigned"}.`,
    });
  }

  const mapping: PlayerMapping[] = [];
  const rosterIdBySheetLabel = new Map<string, string>();
  const mapPair = (obs: ExtractedPlayer, slot: RosterSlot, crossDepth: boolean) => {
    mapping.push({
      sheetLabel: obs.label,
      rosterId: slot.id,
      ...(obs.color ? { sheetColor: obs.color } : {}),
    });
    rosterIdBySheetLabel.set(obs.label.trim().toUpperCase(), slot.id);
    if (crossDepth) {
      warnings.push({
        code: "player_mapping_cross_depth",
        message: `Sheet player "${obs.label}" landed on slot ${slot.id} at a different depth than drawn (line vs backfield) — double-check their position.`,
      });
    }
  };
  const obsFront = observed.filter((p) => !p.backfield);
  const obsBack = observed.filter((p) => p.backfield);
  const rosFront = roster.filter((s) => s.y > BACKFIELD_Y);
  const rosBack = roster.filter((s) => s.y <= BACKFIELD_Y);
  const frontN = Math.min(obsFront.length, rosFront.length);
  const backN = Math.min(obsBack.length, rosBack.length);
  for (let i = 0; i < frontN; i++) mapPair(obsFront[i], rosFront[i], false);
  for (let i = 0; i < backN; i++) mapPair(obsBack[i], rosBack[i], false);
  // Cross-fill leftovers (e.g. a 2-back play into a 1-back formation)
  // rather than dropping readable players — flagged per pair.
  const leftoverObs = [...obsFront.slice(frontN), ...obsBack.slice(backN)];
  const leftoverRos = [...rosFront.slice(frontN), ...rosBack.slice(backN)];
  const crossN = Math.min(leftoverObs.length, leftoverRos.length);
  for (let i = 0; i < crossN; i++) mapPair(leftoverObs[i], leftoverRos[i], true);
  for (const obs of leftoverObs.slice(crossN)) {
    warnings.push({
      code: "player_unmapped",
      message: `Sheet player "${obs.label}" had no open slot in ${formationName} and was dropped.`,
    });
  }
  // Present the mapping in sheet reading order regardless of pairing order.
  const sheetOrder = new Map(observed.map((p, i) => [p.label.trim().toUpperCase(), i]));
  mapping.sort(
    (a, b) => (sheetOrder.get(a.sheetLabel.trim().toUpperCase()) ?? 99) - (sheetOrder.get(b.sheetLabel.trim().toUpperCase()) ?? 99),
  );

  // ── 2b. Alignment targets ─────────────────────────────────────────
  // Place each mapped player where the PHOTO shows them (bucket →
  // yards) rather than where the snapped formation's slot sits — the
  // first thing a coach checks is starting positions (field feedback,
  // 2026-07-03). Motion routes also get the spot the route launches
  // from, so the dashed pre-snap motion can be drawn.
  const halfW = sportProfileForVariant(opts.variant).fieldWidthYds / 2;
  const obsByLabel = new Map(observed.map((p) => [p.label.trim().toUpperCase(), p]));
  const assignByLabel = new Map(extraction.assignments.map((a) => [a.player.trim().toUpperCase(), a]));
  for (const m of mapping) {
    const key = m.sheetLabel.trim().toUpperCase();
    const obs = obsByLabel.get(key);
    if (!obs) continue;
    const sameSide = observed.filter((p) => p.side === obs.side);
    const x = bucketX(obs.side, widthWithFallback(obs, sameSide), halfW);
    const y = bucketY(obs);
    m.align = { x, y };
    const routeStart = assignByLabel.get(key)?.routeStart;
    if (routeStart) {
      const rx = bucketX(routeStart.side, routeStart.width, halfW);
      // Motion is lateral — the route launches at the player's own depth.
      if (Math.abs(rx - x) > 1) m.routeStartAt = { x: rx, y };
    }
  }
  // Collision pass per depth row: spread same-row players closer than
  // 2 yds (stacks at DIFFERENT depths are legitimate and untouched).
  const rowsByY = new Map<number, PlayerMapping[]>();
  for (const m of mapping) {
    if (m.align) rowsByY.set(m.align.y, [...(rowsByY.get(m.align.y) ?? []), m]);
  }
  for (const row of rowsByY.values()) {
    row.sort((a, b) => a.align!.x - b.align!.x);
    for (let i = 1; i < row.length; i++) {
      if (row[i].align!.x - row[i - 1].align!.x < 2) {
        row[i].align = { ...row[i].align!, x: row[i - 1].align!.x + 2 };
      }
    }
  }

  // ── 3. Assignments ────────────────────────────────────────────────
  const assignments: PlayerAssignment[] = [];
  const assignedRosterIds = new Set<string>();
  for (const extracted of extraction.assignments) {
    const sheetLabel = extracted.player.trim().toUpperCase();
    if (isSheetSpecialLabel(sheetLabel)) {
      // v1 imports offense skill assignments only; C blocks and Q's
      // dropback are implicit. A drawn QB run / center release is rare
      // enough to hand-fix in the editor.
      if (extracted.kind !== "block" && extracted.kind !== "unclear") {
        warnings.push({
          code: "assignment_skipped",
          message: `${extracted.player}: assignments for the center/QB aren't imported yet — add it in the editor if it matters.`,
        });
      }
      continue;
    }
    const rosterId = rosterIdBySheetLabel.get(sheetLabel);
    if (!rosterId) {
      warnings.push({
        code: "assignment_skipped",
        message: `"${extracted.player}" has an assignment but isn't among the mapped players — skipped.`,
      });
      continue;
    }
    if (assignedRosterIds.has(rosterId)) continue; // first read per player wins
    assignedRosterIds.add(rosterId);
    assignments.push({
      player: rosterId,
      action: buildAction(extracted, extracted.player, opts.maxThrowDepthYds, warnings),
      confidence: extracted.confidence as Confidence,
    });
  }

  // Roster slots nobody claimed: keep them honest (and visible in the
  // review UI) as explicit unassigned players rather than omitting.
  for (const slot of roster) {
    if (!assignedRosterIds.has(slot.id)) {
      const mapped = mapping.find((m) => m.rosterId === slot.id);
      warnings.push({
        code: "player_unassigned",
        message: `${mapped ? `Sheet player "${mapped.sheetLabel}" (slot ${slot.id})` : `Slot ${slot.id}`} has no readable assignment — set a route in the review step.`,
      });
      assignments.push({ player: slot.id, action: { kind: "unspecified" }, confidence: "low" });
    }
  }

  // ── 4. Spec ───────────────────────────────────────────────────────
  const strength = extraction.formation.strength;
  const spec: PlaySpec = {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: opts.variant,
    title: opts.title ?? extraction.title ?? "Imported play",
    playType: "offense",
    formation: {
      name: formationName,
      ...(strength === "left" || strength === "right" ? { strength } : {}),
      confidence: extraction.formation.confidence as Confidence,
    },
    assignments,
  };

  return { spec, warnings, mapping };
}

/* ────────────────────────────────────────────────────────────────────
 * Sheet identity — make the draft LOOK like the photo.
 *
 * Spec assignments must reference roster ids (spec.ts invariant 1), so
 * player IDs never change. But CoachDiagramPlayer has a display `role`
 * (label) and a `color`, and the review experience lives or dies on
 * the coach being able to eyeball photo vs draft player-by-player —
 * sheet-black-Z rendering as a red "X" reads as wrong even when the
 * route is right (first prod test, 2026-07-03).
 * ──────────────────────────────────────────────────────────────────── */

/** Extraction color vocabulary → diagram hex. Tuned to read like the
 *  printed sheets (and stay distinguishable on the green field). */
export const SHEET_COLOR_HEX: Record<string, string> = {
  black: "#1F2937",
  gray: "#6B7280",
  white: "#E5E7EB",
  red: "#DC2626",
  orange: "#EA580C",
  yellow: "#EAB308",
  green: "#059669",
  blue: "#2563EB",
  purple: "#7C3AED",
  pink: "#DB2777",
  brown: "#92400E",
};

/** Relabel + recolor mapped players so the draft wears the sheet's own
 *  letters and colors. IDs are untouched; unmapped players (C, QB)
 *  keep their defaults. `labels: false` keeps the playbook's slot
 *  letters and applies colors only (coach's choice at review time).
 *  Pure — returns a new diagram. */
export function applySheetIdentity(
  diagram: CoachDiagram,
  mapping: PlayerMapping[],
  opts: { labels?: boolean } = {},
): CoachDiagram {
  if (mapping.length === 0) return diagram;
  const labels = opts.labels !== false;
  const byRosterId = new Map(mapping.map((m) => [m.rosterId, m]));
  return {
    ...diagram,
    players: diagram.players.map((p) => {
      const m = byRosterId.get(p.id);
      if (!m) return p;
      const hex = m.sheetColor ? SHEET_COLOR_HEX[m.sheetColor] : undefined;
      return { ...p, ...(labels ? { role: m.sheetLabel } : {}), ...(hex ? { color: hex } : {}) };
    }),
  };
}

/**
 * Move mapped players to the photo's alignment targets and carry their
 * routes with them. Route paths are ABSOLUTE field yards, so each
 * route translates by its carrier's delta; motion routes anchor at
 * `routeStartAt` instead, with the dashed pre-snap motion drawn from
 * the player's spot to the launch point (the diagram format renders
 * `motion` waypoints natively). Sanitizes before returning (Rule 10 —
 * every new diagram transform sanitizes).
 */
export function applyPhotoAlignment(
  diagram: CoachDiagram,
  mapping: PlayerMapping[],
  variant: SportVariant,
): CoachDiagram {
  const moves = mapping.filter((m) => m.align);
  if (moves.length === 0) return diagram;
  const byRosterId = new Map(moves.map((m) => [m.rosterId, m]));
  const oldPos = new Map(diagram.players.map((p) => [p.id, { x: p.x, y: p.y }]));

  const players = diagram.players.map((p) => {
    const m = byRosterId.get(p.id);
    return m?.align ? { ...p, x: m.align.x, y: m.align.y } : p;
  });

  const routes = (diagram.routes ?? []).map((r) => {
    const m = byRosterId.get(r.from);
    const old = oldPos.get(r.from);
    if (!m?.align || !old) return r;
    const anchor = m.routeStartAt ?? m.align;
    // Translate in X ONLY. Waypoint y-values are LOS-anchored depths
    // (a Post's apex at y=15 means 15 yds past the line no matter where
    // the carrier stands), and the drawn route always starts at the
    // carrier's own position — so shifting y would corrupt depth
    // semantics (the render-guard test caught a Post inflating to
    // 20 yds), while leaving y keeps depths true and routes attached.
    const dx = anchor.x - old.x;
    const path = r.path.map(([x, y]) => [x + dx, y] as [number, number]);
    if (!m.routeStartAt) return { ...r, path };
    // Motion routes: the post-motion geometry isn't expressible as the
    // carrier's catalog route (a flat launched from the far side of the
    // formation "breaks inside" from where the carrier STANDS), so the
    // diagram-level catalog tag comes off — the validators treat it as
    // freeform geometry, exactly as they'd treat a hand-drawn jet
    // motion. The SPEC keeps the semantic family + "motion" modifier
    // for notes/KB truth.
    const rest = { ...r, path, motion: [[m.routeStartAt.x, m.routeStartAt.y]] as [number, number][] } as typeof r & {
      route_kind?: string;
      direction?: string;
    };
    delete rest.route_kind;
    delete rest.direction;
    return rest;
  });

  return sanitizeCoachDiagram({ ...diagram, players, routes }, variant).diagram;
}

/**
 * Rewrite projected notes to use the sheet's letters ("@Z runs...")
 * instead of roster slot ids ("@X runs..."). Two-phase token swap so a
 * sheet letter that collides with a DIFFERENT roster id can't chain
 * (sheet-Z→roster-X while sheet-X→roster-B would otherwise turn @B
 * into @X and then @X into @Z).
 */
export function rewriteNotesToSheetLabels(notes: string, mapping: PlayerMapping[]): string {
  if (!notes || mapping.length === 0) return notes;
  const NUL = String.fromCharCode(0); // can never occur in projected notes
  const tokens = mapping.map((m, i) => ({
    from: `@${m.rosterId}`,
    tmp: NUL + String(i) + NUL,
    to: `@${m.sheetLabel}`,
  }));
  let out = notes;
  // Longest roster ids first so "@Z2" is consumed before "@Z".
  for (const t of [...tokens].sort((a, b) => b.from.length - a.from.length)) {
    out = out.split(t.from).join(t.tmp);
  }
  for (const t of tokens) {
    out = out.split(t.tmp).join(t.to);
  }
  return out;
}
