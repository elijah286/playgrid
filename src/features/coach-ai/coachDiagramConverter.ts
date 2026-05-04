/**
 * Converts a lightweight Coach AI diagram JSON (easy for the LLM to emit)
 * into a full PlayDocument that can be rendered + animated.
 *
 * Coordinate system the AI uses:
 *   x = yards from center (negative = left, positive = right)
 *   y = yards from LOS    (negative = backfield, positive = upfield / downfield)
 */

import { z } from "zod";
import {
  createEmptyPlayDocument,
  sportProfileForVariant,
} from "@/domain/play/factory";
import {
  PLAY_DOCUMENT_SCHEMA_VERSION,
  type PlayDocument,
  type Player,
  type PlayerRole,
  type PlayerShape,
  type Route,
  type RouteNode,
  type RouteSegment,
  type RouteSemantic,
  type SportVariant,
  type Zone,
} from "@/domain/play/types";
import { findTemplate } from "@/domain/play/routeTemplates";

// ── Schema the LLM emits ────────────────────────────────────────────────────

export type CoachDiagramPlayer = {
  id: string;
  role?: string;       // display label (defaults to id)
  x: number;           // yards from center
  y: number;           // yards from LOS
  team?: "O" | "D";   // O=offense (blue), D=defense (red)
  shape?: PlayerShape;
  color?: string;
};

export type CoachDiagramRoute = {
  from: string;                     // player id
  path: [number, number][];         // POST-snap waypoints as [x_yards, y_yards]. May be empty when only `motion` is set.
  curve?: boolean;
  tip?: "arrow" | "t" | "none";
  /**
   * Optional PRE-snap motion waypoints in the same yard coord system.
   * Rendered as the dashed motion zig-zag from the player's start position
   * through these points. The player ends motion at the LAST motion
   * waypoint — the post-snap `path` (if any) starts from there. Use this
   * for jet motion, shifts, fly sweep window-dressing, formation-into-
   * formation looks, etc. Omit for plays without presnap motion.
   */
  motion?: [number, number][];
  /**
   * Optional playback delay in seconds before this route starts moving.
   * Useful for defender reaction routes — e.g. a hook defender that
   * doesn't break on the seam until the inside receiver crosses the
   * 8-yard mark (~0.6s with default pacing).
   */
  startDelaySec?: number;
  /**
   * Optional canonical route family name (case-insensitive lookup against
   * ROUTE_TEMPLATES — e.g. "slant", "post", "dig", "curl"). When set:
   *   1. validateRouteAssignments() checks the path's depth + side against
   *      the catalog's `constraints` for that family. A "12-yard slant"
   *      (slants cap at ~7 yds) is rejected before persistence.
   *   2. The converter populates `Route.semantic` on the resulting
   *      PlayDocument, giving downstream notes generation an authoritative
   *      hook to describe the route consistently.
   * Custom / off-catalog routes leave this unset.
   */
  route_kind?: string;
  /** Optional direction override (matches the spec.ts route action's
   *  direction field). Set on a fence when applyRouteMod / revise_play
   *  / compose_play overrides force a directional family to a specific
   *  side. Round-trips through the converter so the renderer can
   *  re-derive geometry on edit. */
  direction?: "left" | "right";
  /**
   * EXPLICIT user-requested override of catalog depth bounds. When
   * true, validateRouteAssignments() skips the depth-range check for
   * this route (and notes-from-spec surfaces a "deeper than canonical"
   * coaching note). Set ONLY when the coach explicitly asked for an
   * unusual depth ("8-yard drag", "10-yard slant"). The catalog
   * enforcement still catches Cal-authored mistakes — this is the
   * escape hatch for legitimate coach intent.
   */
  nonCanonical?: boolean;
};

export type CoachDiagramZone = {
  kind: "rectangle" | "ellipse";
  /** Center of the zone, in the same yards coord system as players. */
  center: [number, number];
  /** FULL width and height in yards (not half-extents). */
  size: [number, number];
  label: string;
  /** Optional fill color (hex). Defaults to a rotating translucent palette. */
  color?: string;
  /**
   * Optional defender id (e.g. "FS", "CB", "WL") this zone belongs to.
   * When set, the converter colors the zone to match the owning
   * defender's role color — a Cover 1 deep-middle zone owned by the
   * FS paints in the safety color (orange), so the field reads as
   * "this zone goes with that triangle" at a glance. Independent of
   * `color`; `ownerLabel` wins when both are set.
   */
  ownerLabel?: string;
};

export type CoachDiagram = {
  title?: string;
  variant?: string;
  /**
   * Which side is the focus of the diagram. Players on the OTHER side render
   * in muted gray so they provide spatial context without pulling visual
   * attention. Default "O" for offense-focused; explicitly set "D" for a
   * defense-focused diagram (zones, fronts, etc.).
   */
  focus?: "O" | "D";
  players: CoachDiagramPlayer[];
  routes?: CoachDiagramRoute[];
  zones?: CoachDiagramZone[];
};

// ── Runtime schema (strict) ────────────────────────────────────────────
//
// Used at the create_play / update_play tool input boundary to gate
// what Cal can pass as a `diagram` payload. Anything outside this
// hierarchy is invalid and rejected — a coach can't accidentally
// smuggle in custom fields, and Cal can't hide bad geometry under
// keys the converter doesn't recognize.

const playerShapeSchema = z.enum(["circle", "square", "diamond", "triangle", "star"]);

const coachDiagramPlayerSchema = z.object({
  id: z.string(),
  role: z.string().optional(),
  x: z.number(),
  y: z.number(),
  team: z.enum(["O", "D"]).optional(),
  shape: playerShapeSchema.optional(),
  color: z.string().optional(),
}).strict();

const waypointSchema = z.tuple([z.number(), z.number()]);

const coachDiagramRouteSchema = z.object({
  from: z.string(),
  path: z.array(waypointSchema),
  curve: z.boolean().optional(),
  tip: z.enum(["arrow", "t", "none"]).optional(),
  motion: z.array(waypointSchema).optional(),
  startDelaySec: z.number().optional(),
  route_kind: z.string().optional(),
  /** EXPLICIT user-requested override of catalog depth bounds. When
   *  true, route-assignment-validate skips the depth-range check for
   *  this route and surfaces a coaching note instead. Set ONLY when
   *  the coach explicitly requested an unusual depth ("8-yard drag");
   *  the catalog enforcement still catches Cal-authored mistakes. */
  nonCanonical: z.boolean().optional(),
  /** OPTIONAL direction override. When set on a fence by
   *  applyRouteMod (revise_play with set_direction, or compose_play
   *  overrides), the renderer routes the path toward the named
   *  sideline regardless of carrier x. The strict-parse converter
   *  rejected unknown fields previously — leaving the embed UI
   *  hung in a render-fail state when a fence had this field
   *  (surfaced 2026-05-02). Now optional in the schema; the spec
   *  layer stores it on action.direction (see spec.ts). */
  direction: z.enum(["left", "right"]).optional(),
}).strict();

const coachDiagramZoneSchema = z.object({
  kind: z.enum(["rectangle", "ellipse"]),
  center: z.tuple([z.number(), z.number()]),
  size: z.tuple([z.number(), z.number()]),
  label: z.string(),
  color: z.string().optional(),
  ownerLabel: z.string().optional(),
}).strict();

export const coachDiagramSchema = z.object({
  title: z.string().optional(),
  variant: z.string().optional(),
  focus: z.enum(["O", "D"]).optional(),
  players: z.array(coachDiagramPlayerSchema),
  routes: z.array(coachDiagramRouteSchema).optional(),
  zones: z.array(coachDiagramZoneSchema).optional(),
}).strict();

/** Strict parse for the legacy `diagram` input on create_play / update_play.
 *  Rejects unknown keys at any level — Cal can't author rendering
 *  parameters the converter doesn't actually support. */
export function parseCoachDiagram(data: unknown) {
  return coachDiagramSchema.safeParse(data);
}

// ── Style palettes (mirror src/domain/play/factory.ts styleForRole) ───────
//
// Field is green (#2D8B4E), so route stroke = player fill must contrast.
// Defenders: red triangle. Offense: role-keyed color (high-contrast
// convention: QB white, C purple, OTHER gray, RB orange, FB orange, TE
// green, X red, Z blue, Y green, slot yellow). Two slots in the same
// play (H + F-as-slot) share yellow by design — the no-shared-color
// gate flags it and Cal recolors one with set_player_color.
// 2026-05-04: @C moved from black to purple, @B/RB moved from purple
// to orange so the default flag_5v5 set (Q white, C purple, X red,
// Y green, Z blue) is five distinct hues.

type PlayerStyle = { fill: string; stroke: string; labelColor: string };

const STYLE_QB:   PlayerStyle = { fill: "#FFFFFF", stroke: "#0f172a", labelColor: "#1C1C1E" };
// 2026-05-04: @C moved from black (#1C1C1E) to purple (#A855F7) so the
// default flag_5v5 5-player set (Q, C, X, Y, Z) renders in five distinct
// hues. Black previously blended into the dark field background.
const STYLE_C:    PlayerStyle = { fill: "#A855F7", stroke: "#581c87", labelColor: "#FFFFFF" };
const STYLE_X:    PlayerStyle = { fill: "#EF4444", stroke: "#7f1d1d", labelColor: "#FFFFFF" };
const STYLE_Y:    PlayerStyle = { fill: "#22C55E", stroke: "#166534", labelColor: "#FFFFFF" };
const STYLE_Z:    PlayerStyle = { fill: "#3B82F6", stroke: "#1e3a8a", labelColor: "#FFFFFF" };
const STYLE_SLOT: PlayerStyle = { fill: "#FACC15", stroke: "#854d0e", labelColor: "#1C1C1E" }; // S, A, H, F-as-WR
// 2026-05-04: @B (RB) moved from purple to orange — purple now belongs
// to @C, and the 7v7 / tackle pairing of B + C needs distinct hues.
// FB stays orange too; coaches with both B + FB on the field need to
// relabel one or override via set_player_color.
const STYLE_RB:   PlayerStyle = { fill: "#F26522", stroke: "#7c2d12", labelColor: "#FFFFFF" }; // halfback / primary back / role=RB
const STYLE_FB:   PlayerStyle = { fill: "#F26522", stroke: "#7c2d12", labelColor: "#FFFFFF" }; // fullback (label "FB" with role=RB)
const STYLE_DEF:         PlayerStyle = { fill: "#EF4444", stroke: "#991b1b", labelColor: "#FFFFFF" }; // generic — fallback when label doesn't match a role
// Defender role palette. Triangles already mark "defender"; the hue makes
// the role legible (corners vs safeties vs hooks vs flats) so a coach can
// scan a Cover 3 shell and see the structure at a glance.
const STYLE_DEF_CB:      PlayerStyle = { fill: "#DC2626", stroke: "#7f1d1d", labelColor: "#FFFFFF" }; // corners — primary red
const STYLE_DEF_SAFETY:  PlayerStyle = { fill: "#F97316", stroke: "#7c2d12", labelColor: "#FFFFFF" }; // safeties — deep coral
const STYLE_DEF_HOOK:    PlayerStyle = { fill: "#A855F7", stroke: "#581c87", labelColor: "#FFFFFF" }; // hook defenders — purple
const STYLE_DEF_FLAT:    PlayerStyle = { fill: "#0EA5E9", stroke: "#075985", labelColor: "#FFFFFF" }; // flat defenders — teal
const STYLE_DEF_LB:      PlayerStyle = { fill: "#EC4899", stroke: "#831843", labelColor: "#FFFFFF" }; // LBs / Mike — magenta
const STYLE_DEF_NICKEL:  PlayerStyle = { fill: "#F472B6", stroke: "#9d174d", labelColor: "#FFFFFF" }; // nickel / slot DB — rose
const STYLE_DEF_DL:      PlayerStyle = { fill: "#7F1D1D", stroke: "#450a0a", labelColor: "#FFFFFF" }; // D-line (DE/DT/NT) — dark crimson, distinct from CB primary red
// Interior offensive linemen are ineligible — they should be visually muted so
// skill-position routes pop. Gray, neutral.
const STYLE_LINEMAN: PlayerStyle = { fill: "#94A3B8", stroke: "#475569", labelColor: "#0f172a" };
// Non-focus side — when the diagram focuses on offense, all defenders render
// in this very-muted gray so they're visible-as-context without competing
// with the offense (and vice versa for defense-focused diagrams).
const STYLE_NON_FOCUS: PlayerStyle = { fill: "#CBD5E1", stroke: "#94A3B8", labelColor: "#475569" };

// Distinct hues for genuinely unknown skill labels — keeps the Nth unknown
// receiver from collapsing to the same color as the (N-5)th. Order matches
// the position-derivation priority so the first unknown looks like an X-
// equivalent, the second a Y-equivalent, and so on.
const RECEIVER_ROTATION: PlayerStyle[] = [STYLE_X, STYLE_Y, STYLE_Z, STYLE_SLOT, STYLE_RB, STYLE_FB];

// Map a defender's id (as returned by place_defense or hand-authored by Cal)
// to a role-coded style. Matches the catalog labels used in
// src/domain/play/defensiveAlignments.ts plus common synonyms. Falls back to
// the generic red STYLE_DEF when nothing matches.
function defenderStyleFor(rawLabel: string): PlayerStyle {
  const u = rawLabel.toUpperCase();
  // Corners — outermost, deep edges. Includes split-cloud variants.
  if (u === "CB" || u === "LC" || u === "RC" || u === "LCB" || u === "RCB") return STYLE_DEF_CB;
  // Safeties — deep middle / split halves.
  if (u === "FS" || u === "SS" || u === "SAFETY" || u === "FSL" || u === "FSR" || u === "SAF" || u === "SA" || u === "SA2") return STYLE_DEF_SAFETY;
  // Hook / curl defenders — interior underneath.
  if (u === "HL" || u === "HR" || u === "HM" || u === "HOOK" || u === "M" || u === "MIKE" || u === "MI") return STYLE_DEF_HOOK;
  // Flat defenders — outside underneath.
  if (u === "FL" || u === "FR" || u === "FLAT" || u === "WA" || u === "WI") return STYLE_DEF_FLAT;
  // LBs (Will/Sam variants, generic LB).
  if (
    u === "LB" || u === "WLB" || u === "SLB" || u === "MLB" ||
    u === "WILL" || u === "SAM" || u === "WI" ||
    u === "ILB" || u === "OLB" ||
    // 4-4 stack labels (WL = Will, ML = Mike, BK = Buck/Mac, SL = Sam) +
    // 3-4 inside/outside labels.
    u === "WL" || u === "ML" || u === "SL" || u === "BK" ||
    u === "IL" || u === "OL" || u === "BUCK" || u === "MAC"
  ) return STYLE_DEF_LB;
  // Nickel / slot DB.
  if (u === "NB" || u === "NICKEL" || u === "STAR" || u === "DIME") return STYLE_DEF_NICKEL;
  // D-line — ends, tackles, nose tackles. Without a dedicated entry these
  // fell through to the generic red and looked identical to the CBs.
  if (u === "DE" || u === "DT" || u === "DL" || u === "NT" || u === "NG" || u === "DI" || u === "EDGE") return STYLE_DEF_DL;
  return STYLE_DEF;
}


// Labels for interior O-line — gets the muted-gray treatment regardless of
// position-rotation order.
const LINEMAN_LABELS = new Set([
  "LT", "LG", "RG", "RT", "T", "G", "OL",
  "LT1", "LG1", "RG1", "RT1",
]);

// ── Derived-color exports for the chat-time validator + revise_play ──────
//
// The validator needs to detect "two players sharing the same auto-derived
// color" without re-implementing the position→color mapping. The
// `set_player_color` mod needs a fixed palette enum so Cal can't invent
// invalid hex codes. Both paths share these exports.

/** The semantic color group a player's label maps to. Two skill-position
 *  players in the SAME group render in the same hue — a readability bug. */
export type DerivedColorGroup =
  | "X" | "Y" | "Z" | "SLOT" | "RB" | "FB"
  | "QB" | "C" | "LINEMAN" | "ROTATION";

/** Canonical playbook palette — names a coach can reason about, mapped
 *  to the same hex codes the position-derived styles use. The
 *  `set_player_color` mod and validator messages reference these names. */
export const PLAYBOOK_PALETTE = {
  red:    "#EF4444",
  orange: "#F26522",
  yellow: "#FACC15",
  green:  "#22C55E",
  blue:   "#3B82F6",
  purple: "#A855F7",
  black:  "#1C1C1E",
  white:  "#FFFFFF",
  gray:   "#94A3B8",
} as const;

export type PaletteName = keyof typeof PLAYBOOK_PALETTE;
export const PALETTE_NAMES: PaletteName[] = Object.keys(PLAYBOOK_PALETTE) as PaletteName[];

/** Map a raw label (and optional role) to its derived color group. The
 *  branches mirror the offense styling switch in coachDiagramToPlayDocument
 *  so the validator's rejection criteria match the renderer's coloring
 *  EXACTLY — change them in lockstep. */
export function derivedColorGroupForLabel(rawLabel: string, role?: string): DerivedColorGroup {
  const upper = (rawLabel ?? "").toUpperCase();
  const upperRole = (role ?? "").toUpperCase();
  if (upper === "QB" || upper === "Q" || upperRole === "QB") return "QB";
  if (upper === "C" || upperRole === "C") return "C";
  if (LINEMAN_LABELS.has(upper)) return "LINEMAN";
  const base = upper.replace(/\d+$/, "");
  // Role-first for backs and TE — disambiguates label F (RB in 7v7 default,
  // slot in 2x2 doubles) and label B/HB (always RB).
  if (base === "FB") return "FB";
  if (upperRole === "RB" || base === "B" || base === "HB" || base === "RB") return "RB";
  if (upperRole === "TE" || base === "TE") return "Y";
  if (base === "X") return "X";
  if (base === "Y") return "Y";
  if (base === "Z") return "Z";
  // Slot family — S, A, H, F-as-WR all share yellow. The role===RB path
  // above already claimed F-as-back, so F arriving here is a slot.
  if (base === "S" || base === "A" || base === "H" || base === "F") return "SLOT";
  return "ROTATION";
}

/** The hex the auto-renderer produces for each skill-position group.
 *  Used by the validator's error message ("@H + @S both render yellow").
 *
 *  2026-05-04: convention update — @C is now PURPLE (was black) so the
 *  five default flag_5v5 players (Q, C, X, Y, Z) each get a distinct
 *  recognizable hue (white / purple / red / green / blue). Black was
 *  visually muddy against the dark field background and made @C blend
 *  in with the LOS shading. The RB group moved off purple to ORANGE
 *  (was purple) to keep B and C distinct when both appear in 7v7 +
 *  tackle. FB stays orange too — coaches with both B + FB (rare in
 *  flag, occasional in tackle) need to relabel one or override via
 *  set_player_color. */
export const DERIVED_GROUP_HEX: Record<Exclude<DerivedColorGroup, "ROTATION" | "LINEMAN">, string> = {
  X:    "#EF4444",
  Y:    "#22C55E",
  Z:    "#3B82F6",
  SLOT: "#FACC15",
  RB:   "#F26522",
  FB:   "#F26522",
  QB:   "#FFFFFF",
  C:    "#A855F7",
};

// Default zone style — matches `mkZone`, which is what coaches get
// when they drop a zone via the editor's rect/ellipse tools. Used as a
// fallback when no `ownerLabel` is supplied (e.g. user hand-drawn
// zones). Cal-emitted catalog zones override this with the owning
// defender's role color so the zone visually pairs with its triangle.
const ZONE_STYLE = { fill: "rgba(59,130,246,0.18)", stroke: "rgba(59,130,246,0.7)" };

/**
 * Convert a hex color (e.g. "#F97316") to a translucent rgba fill at
 * the given opacity. Used to derive zone fills from defender role
 * colors so a Cover 1 deep-middle zone owned by the FS paints in the
 * same orange family as the FS triangle.
 */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex; // already rgba/css; pass through
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Resolve zone style from an owner defender label, falling back to the
 *  default user-style blue when no owner is set. */
function zoneStyleForOwner(ownerLabel: string | undefined): { fill: string; stroke: string } {
  if (!ownerLabel) return ZONE_STYLE;
  const ds = defenderStyleFor(ownerLabel);
  return {
    fill: hexToRgba(ds.fill, 0.18),
    stroke: hexToRgba(ds.fill, 0.85),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveVariant(raw: string | undefined): SportVariant {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("5v5") || v.includes("5x5")) return "flag_5v5";
  if (v.includes("7v7") || v.includes("7x7")) return "flag_7v7";
  if (v.includes("tackle") || v.includes("11")) return "tackle_11";
  return "flag_7v7";
}

function guessTeam(p: CoachDiagramPlayer): "O" | "D" {
  if (p.team) return p.team;
  const r = (p.role ?? p.id).toUpperCase();
  if (["CB", "S", "FS", "SS", "MLB", "MLB", "ILB", "OLB", "DE", "DT", "DL", "LB", "NB", "M", "W", "B"].includes(r)) return "D";
  return "O";
}

function guessRole(p: CoachDiagramPlayer): PlayerRole {
  const r = (p.role ?? p.id).toUpperCase();
  const map: Record<string, PlayerRole> = {
    QB: "QB", RB: "RB", WR: "WR", TE: "TE", C: "C",
    CB: "CB", S: "S", FS: "S", SS: "S",
    LB: "LB", MLB: "LB", ILB: "LB", OLB: "LB",
    DE: "DL", DT: "DL", DL: "DL",
    NB: "NB", K: "K", P: "P",
  };
  return map[r] ?? "OTHER";
}

let _uid = 0;
function uid() { return `cd_${++_uid}_${Math.random().toString(36).slice(2, 7)}`; }

/**
 * Map a CoachDiagramRoute's `route_kind` to a RouteSemantic suitable for
 * persistence on the resulting Route. RouteSemantic.family is a narrow
 * enum (slant/go/post/corner/comeback/out/in/whip/wheel/flat/custom) — for
 * catalog families outside that set (dig, hitch, curl, etc.) we use
 * `"custom"` with a tag holding the canonical name. Once the enum is
 * widened in a follow-up, this fallback path goes away.
 */
const RECOGNIZED_FAMILIES: ReadonlySet<RouteSemantic["family"]> = new Set([
  "slant", "go", "post", "corner", "comeback", "out", "in", "whip", "wheel", "flat", "custom",
]);

function semanticFromRouteKind(rawKind: string | undefined): RouteSemantic | null {
  if (!rawKind) return null;
  const trimmed = rawKind.trim();
  if (!trimmed) return null;
  // findTemplate honors aliases (e.g. "fly" → Go, "shallow" → Drag) so
  // Cal's natural names resolve to the catalog's canonical name.
  const template = findTemplate(trimmed);
  const canonical = (template?.name ?? trimmed).toLowerCase();
  if (RECOGNIZED_FAMILIES.has(canonical as RouteSemantic["family"])) {
    return { family: canonical as RouteSemantic["family"] };
  }
  return { family: "custom", tags: [canonical] };
}

// ── Main converter ──────────────────────────────────────────────────────────

export function coachDiagramToPlayDocument(diagram: CoachDiagram): PlayDocument {
  const variant = resolveVariant(diagram.variant);
  const profile = sportProfileForVariant(variant);
  const LOS_Y = 0.4; // normalized LOS position in the 25-yard window

  /** Convert AI yards → normalized field coords. Non-finite inputs (model
   *  emitted a missing/null/NaN coord) collapse to the field center instead
   *  of poisoning the viewBox computation downstream with NaN. */
  function toNorm(xYds: number, yYds: number): { x: number; y: number } {
    const xn = Number.isFinite(xYds) ? 0.5 + xYds / profile.fieldWidthYds : 0.5;
    const yn = Number.isFinite(yYds) ? LOS_Y + yYds / profile.fieldLengthYds : LOS_Y;
    return {
      x: Math.max(0, Math.min(1, xn)),
      y: Math.max(0, Math.min(1, yn)),
    };
  }

  /**
   * Defenders MUST be on their side of the ball (y ≥ 1 yard downfield from
   * LOS). Models occasionally place a defender at y=0 or y<0 — render them
   * stacked into the offense, which looks broken. Hard-clamp at the boundary.
   */
  const MIN_DEFENDER_Y_YDS = 1;
  /**
   * Offense at the snap can never be downfield (y > 0 = past the LOS = illegal
   * formation / illegal man downfield). If the model slips, clamp to 0.
   */
  const MAX_OFFENSE_Y_YDS = 0;

  // Default focus: offense (most common request). Defense diagrams must
  // explicitly opt in via diagram.focus = "D".
  const focus: "O" | "D" = diagram.focus === "D" ? "D" : "O";

  // First pass: bucket players by team and clamp y. We resolve overlaps in a
  // second pass once everyone's clamped position is known.
  type StagedPlayer = { dp: CoachDiagramPlayer; team: "O" | "D"; x: number; y: number };
  const staged: StagedPlayer[] = diagram.players.map((dp) => {
    const team = guessTeam(dp);
    const rawX = Number.isFinite(dp.x) ? dp.x : 0;
    const rawY = Number.isFinite(dp.y) ? dp.y : 0;
    const y = team === "D"
      ? Math.max(MIN_DEFENDER_Y_YDS, rawY)
      : Math.min(MAX_OFFENSE_Y_YDS, rawY);
    return { dp, team, x: rawX, y };
  });

  // QB MUST be behind the center — football rule, not a stylistic preference.
  // Models occasionally drop the QB at the right hash (next to the slot) or
  // shift him a yard off-center on shotgun calls; both render as a malformed
  // formation. Snap the QB's x to the center's x while preserving y (so
  // under-center y≈-1 and shotgun y≈-5 both still work). If the diagram
  // omits a center, fall back to x=0 (the field midline).
  const centerOnO = staged.find((sp) =>
    sp.team === "O" && (
      (sp.dp.role ?? sp.dp.id).toUpperCase() === "C" ||
      guessRole(sp.dp) === "C"
    ),
  );
  const centerX = centerOnO ? centerOnO.x : 0;
  for (const sp of staged) {
    if (sp.team !== "O") continue;
    const lab = (sp.dp.role ?? sp.dp.id).toUpperCase();
    if (lab === "QB" || lab === "Q" || guessRole(sp.dp) === "QB") {
      sp.x = centerX;
    }
  }

  // Resolve overlaps within each team. The token is rendered as a circle of
  // normalized radius 0.032 (see PlayDiagramEmbed) — i.e. visual diameter
  // 0.064 in normalized field units. Two tokens visually overlap when their
  // NORMALIZED center-to-center distance is < 0.064. The previous version
  // checked hypot in YARDS against 1.2, which fails badly on tackle_11
  // (53yd wide): the visual diameter there is 0.064 × 53 ≈ 3.4 yards, so
  // O-line tokens placed at the realistic 2-yard splits jam together
  // ("LT LC Q CR H" mash-up). We now check in normalized coords with a
  // small breathing buffer so adjacent linemen sit close but never overlap.
  const TOKEN_DIAMETER_NORM = 0.064;
  const OVERLAP_THRESHOLD_NORM = TOKEN_DIAMETER_NORM * 1.05; // 5% breathing
  const NUDGE_STEP_YDS_X = OVERLAP_THRESHOLD_NORM * profile.fieldWidthYds;
  // The QB has just been snapped to center.x and must STAY there. If a slot
  // or back is too close to the QB, push the OTHER guy aside instead of
  // moving the QB. Same rule applies to the C — he anchors the OL spacing.
  const isAnchored = (sp: StagedPlayer): boolean => {
    if (sp.team !== "O") return false;
    const lab = (sp.dp.role ?? sp.dp.id).toUpperCase();
    return lab === "QB" || lab === "Q" || lab === "C" ||
      guessRole(sp.dp) === "QB" || guessRole(sp.dp) === "C";
  };
  // Lineman pairs are exempt from overlap resolution. Real OL splits are
  // 1-2 yards, but the rendered token diameter on tackle_11 is ~3.4yds
  // (token radius 0.032 normalized × 53yd field width). So adjacent
  // linemen are always going to "visually overlap" by the token-pixel
  // definition — and that's CORRECT, because coaches read the OL row as
  // a single tight unit.
  //
  // The previous resolver tried to nudge linemen apart and entered an
  // oscillation: nudging LG outward landed it inside C's anchor zone,
  // C pushed it back, repeat. After MAX_ITERS the resolver left LG
  // visually stacked on LT (the bug surfaced 2026-05-01 in production).
  // Skipping OL-OL pairs eliminates the cycle entirely.
  const isLineman = (sp: StagedPlayer): boolean => {
    if (sp.team !== "O") return false;
    const lab = (sp.dp.role ?? sp.dp.id).toUpperCase();
    return LINEMAN_LABELS.has(lab) || lab === "C";
  };
  // Tight end attached to the OL is conceptually part of the OL row
  // for overlap-resolution purposes — real TE alignment puts him 1-2yd
  // outside RT, well within the resolver's normalized-distance
  // threshold but visually CORRECT (the TE is supposed to look tight).
  // 2026-05-02 surfaced this when Y at (6, 0) and RT at (4, 0) triggered
  // a Y-vs-RT overlap that cascaded into Y-vs-H oscillation in
  // Singleback / Pro Set / Pro I formations. Treating an on-line Y as
  // OL-adjacent breaks the cycle.
  const isOnLineTe = (sp: StagedPlayer): boolean => {
    if (sp.team !== "O") return false;
    const lab = (sp.dp.role ?? sp.dp.id).toUpperCase();
    return lab === "Y" && sp.y === 0;
  };
  const isOlRow = (sp: StagedPlayer): boolean => isLineman(sp) || isOnLineTe(sp);
  // Iterate to convergence. The previous single-pass nudge resolved each
  // pair once, but a player can land on top of a third player after being
  // pushed (cascading collisions). Loop until no overlaps remain or we hit
  // a safety cap. MAX_ITERS is intentionally generous — 22 offensive +
  // defensive players × ~3 cascades stays well under 100.
  const MAX_ITERS = 100;
  let lastIterMoved = false;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let moved = false;
    for (let i = 0; i < staged.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = staged[i];
        const b = staged[j];
        if (a.team !== b.team) continue;
        // Skip OL-OL pairs — see "Lineman pairs are exempt" above.
        if (isOlRow(a) && isOlRow(b)) continue;
        // Skip anchored-anchored pairs. The only realistic case is QB-on-C
        // for under-center alignment (QB at (0, -1), C at (0, 0)) — that's
        // 1 yd apart in y, normalized 0.04, which trips the 0.067 threshold
        // even though the formation is correct football geometry. The QB is
        // SUPPOSED to look stacked behind the C. Nudging the QB sideways
        // breaks the under-center snap visually AND cascades into a
        // QB-on-H collision that the throw block then surfaces as
        // "Diagram failed to render" (Y-Cross / Singleback under-center).
        // 2026-05-03 surfaced this in production via compose_play("Y-Cross").
        if (isAnchored(a) && isAnchored(b)) continue;
        const aN = toNorm(a.x, a.y);
        const bN = toNorm(b.x, b.y);
        const dnx = aN.x - bN.x;
        const dny = aN.y - bN.y;
        if (Math.hypot(dnx, dny) < OVERLAP_THRESHOLD_NORM) {
          // Decide who moves. Anchored players (QB, C) never move; push the
          // other one.
          const aAnchored = isAnchored(a);
          const moveA = !aAnchored;
          const mover = moveA ? a : b;
          const pivot = moveA ? b : a;
          const dir = mover.x === pivot.x
            ? (mover.x >= 0 ? 1 : -1)
            : Math.sign(mover.x - pivot.x);
          mover.x = pivot.x + dir * NUDGE_STEP_YDS_X;
          moved = true;
        }
      }
    }
    lastIterMoved = moved;
    if (!moved) break;
  }
  // Hard-failure assertion: if the resolver didn't converge (still moved
  // on the last iteration after MAX_ITERS), there's a structural problem
  // in the inputs — a 3-player oscillation, mutual anchoring conflict,
  // or other geometry the resolver can't fix. Surface it loudly rather
  // than silently saving a malformed diagram (which is exactly what the
  // 2026-05-01 LT-on-LG bug looked like). The error includes which
  // players still overlap so Cal can re-emit with corrected geometry.
  if (lastIterMoved) {
    const overlaps: string[] = [];
    for (let i = 0; i < staged.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = staged[i];
        const b = staged[j];
        if (a.team !== b.team) continue;
        if (isOlRow(a) && isOlRow(b)) continue;
        // Same exemption as the resolver pass — anchored-anchored pairs
        // (QB-on-C under center) are intentional football geometry, not
        // a real overlap to fail on.
        if (isAnchored(a) && isAnchored(b)) continue;
        const aN = toNorm(a.x, a.y);
        const bN = toNorm(b.x, b.y);
        if (Math.hypot(aN.x - bN.x, aN.y - bN.y) < OVERLAP_THRESHOLD_NORM) {
          overlaps.push(`"${a.dp.id}" and "${b.dp.id}" (Δ ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(2)} yds)`);
        }
      }
    }
    if (overlaps.length > 0) {
      throw new Error(
        `Overlap resolver failed to converge after ${MAX_ITERS} iterations. ` +
        `Players still overlap: ${overlaps.slice(0, 4).join("; ")}` +
        `${overlaps.length > 4 ? `, +${overlaps.length - 4} more` : ""}. ` +
        `This usually means two players were authored at exactly the same (x, y), ` +
        `or three players are clustered in a way the greedy nudge can't separate. ` +
        `Re-emit the diagram with distinct positions, or call place_offense / place_defense ` +
        `to use the canonical layout.`,
      );
    }
  }

  // Build Player objects.
  //
  // We track players two ways:
  //   - `allPlayers` — every player, preserving duplicates (defensive
  //     alignments routinely return TWO defenders with the same label,
  //     e.g. "CB" left + "CB" right in Cover 3).
  //   - `routeLookup` — id → first-occurrence Player, used only for
  //     route carrier resolution. Routes are offensive in practice and
  //     offense ids are unique, so first-occurrence is safe.
  const allPlayers: Player[] = [];
  const routeLookup = new Map<string, Player>();
  let receiverIdx = 0;
  for (const sp of staged) {
    const dp = sp.dp;
    const team = sp.team;
    const norm = toNorm(sp.x, sp.y);
    const role = guessRole(dp);
    const rawLabel = (dp.role ?? dp.id).toUpperCase();
    // Non-focus side gets a single uniform muted style — overrides everything
    // (color, lineman gray, receiver rotation) so the focus side reads cleanly.
    const isFocus = team === focus;

    let style: PlayerStyle;
    let label: string;
    let shape: PlayerShape;
    if (team === "D") {
      // Defenders are always triangles. The triangle's apex points toward
      // the offense (south on the SVG) — handled in PlayDiagramEmbed.
      style = isFocus ? defenderStyleFor(rawLabel) : STYLE_NON_FOCUS;
      // Hard 2-char limit — matches the play editor's label length cap.
      label = rawLabel.slice(0, 2);
      shape = "triangle";
    } else {
      // Offense: ALWAYS circle. Hard rule — never honor `dp.shape: "triangle"`
      // on the offense even if the model emits one.
      shape = "circle";
      if (rawLabel === "QB" || rawLabel === "Q" || role === "QB") {
        style = STYLE_QB;
        label = "Q";
      } else if (rawLabel === "C" || role === "C") {
        style = STYLE_C;
        label = "C";
      } else if (LINEMAN_LABELS.has(rawLabel)) {
        style = STYLE_LINEMAN;
        label = rawLabel.slice(0, 2);
      } else {
        // Strip trailing digits so "H2", "X2", "Z2", "F2", "B2", "S2"
        // all route to the SAME color/style as their base label. The
        // displayed label keeps the suffix (so H2 still shows "H2"),
        // but the COLOR matches the base. Without this, H2 used to
        // fall through to the generic receiver-rotation palette and
        // get STYLE_X (red) — visually indistinguishable from the X
        // receiver. Surfaced 2026-05-01 in production.
        const baseLabel = rawLabel.replace(/\d+$/, "");
        // Role-first dispatch for backs and TE — disambiguates labels
        // that mean different things in different formations (F is RB
        // in 7v7 default but a slot in 2x2 doubles; role disambiguates).
        if (baseLabel === "FB" || (role === "RB" && baseLabel === "FB")) {
          // Explicit fullback — orange — so HB + FB pair contrasts in
          // I-form / 21 personnel.
          style = STYLE_FB;
          label = rawLabel.slice(0, 2);
        }
        else if (role === "RB" || baseLabel === "B" || baseLabel === "HB" || baseLabel === "RB") {
          // Halfback / single back — purple. The 7v7 "F" (role=RB)
          // lands here too via role-match, keeping the lone back purple.
          style = STYLE_RB;
          label = rawLabel === "RB" ? "B" : rawLabel.slice(0, 2);
        }
        else if (role === "TE" || baseLabel === "TE") {
          style = STYLE_Y;
          label = rawLabel === "TE" ? "Y" : rawLabel.slice(0, 2);
        }
        else if (baseLabel === "X") { style = STYLE_X; label = rawLabel.slice(0, 2); }
        else if (baseLabel === "Y") { style = STYLE_Y; label = rawLabel.slice(0, 2); }
        else if (baseLabel === "Z") { style = STYLE_Z; label = rawLabel.slice(0, 2); }
        else if (baseLabel === "S" || baseLabel === "A" || baseLabel === "H" || baseLabel === "F") {
          // Slot family — yellow. F here is the WR-role slot (2x2
          // doubles); the role===RB path above already claimed F-as-back.
          style = STYLE_SLOT;
          label = rawLabel.slice(0, 2);
        } else {
          // Genuinely unknown skill label (no recognizable base) —
          // rotate the palette so multiple unknown receivers get
          // distinct colors instead of all the same.
          style = RECEIVER_ROTATION[receiverIdx % RECEIVER_ROTATION.length];
          receiverIdx += 1;
          label = rawLabel.slice(0, 2);
        }
      }
      // Non-focus offense overrides position-derived style.
      if (!isFocus) style = STYLE_NON_FOCUS;
    }

    // Honor the model's explicit `color` override on EITHER side. The
    // override is the escape hatch for coach-driven recoloring (Cal's
    // `set_player_color` revise mod, or a hand-authored fence): when a
    // coach asks "make @H purple", we want that to land on the offense
    // token whether the diagram is offense-focused or defense-focused.
    // Non-focus default styling (STYLE_NON_FOCUS) still applies when no
    // explicit color is set — only the override path crosses the gate.
    if (dp.color) style = { ...style, fill: dp.color };

    const player: Player = {
      id:       uid(),
      role,
      label,
      position: norm,
      eligible: team === "O",
      style,
      shape,
    };
    allPlayers.push(player);
    // Player ids must be unique within a diagram. Without this guard the
    // second player at the same id silently loses its routes (they all
    // attach to the first), producing the "two Z receivers, one anchor"
    // bug. Throw so the agent sees the error and re-emits with suffixed
    // ids (Z, Z2) on the next turn.
    if (routeLookup.has(dp.id)) {
      throw new Error(
        `Duplicate player id "${dp.id}" — every player in a diagram needs a unique id. ` +
        `When two players share a position letter (twins, two Zs in 4-wide, etc.), suffix the second one (e.g. "Z" and "Z2") and reference that exact id in routes.`,
      );
    }
    routeLookup.set(dp.id, player);
  }

  // Build Route objects
  const routes: Route[] = [];
  for (const dr of diagram.routes ?? []) {
    const carrier = routeLookup.get(dr.from);
    if (!carrier) continue;

    // Nodes: start from player position, then presnap motion waypoints
    // (if any), then postsnap route waypoints. Motion segments use the
    // "motion" strokePattern so the renderer draws them as the dashed
    // pre-snap zig-zag and the animation system collapses them to a
    // straight line at runtime.
    const startNode: RouteNode = { id: uid(), position: { ...carrier.position } };
    const motionNodes: RouteNode[] = (dr.motion ?? []).map(([wx, wy]) => ({
      id:       uid(),
      position: toNorm(wx, wy),
    }));
    const pathNodes: RouteNode[] = dr.path.map(([wx, wy]) => ({
      id:       uid(),
      position: toNorm(wx, wy),
    }));
    const nodes = [startNode, ...motionNodes, ...pathNodes];

    // Segments: motion segments first (strokePattern "motion"), then
    // postsnap segments (strokePattern "solid"). Motion is always drawn
    // straight — curving a motion path makes no sense visually.
    const segments: RouteSegment[] = [];
    const motionCount = motionNodes.length;
    for (let i = 0; i < nodes.length - 1; i++) {
      const isMotion = i < motionCount;
      segments.push({
        id:            uid(),
        fromNodeId:    nodes[i].id,
        toNodeId:      nodes[i + 1].id,
        shape:         isMotion ? "straight" : (dr.curve ? "curve" : "straight"),
        strokePattern: isMotion ? "motion" : "solid",
        controlOffset: null,
      });
    }
    if (segments.length === 0) continue;

    routes.push({
      id:              uid(),
      carrierPlayerId: carrier.id,
      semantic:        semanticFromRouteKind(dr.route_kind),
      nodes,
      segments,
      style: {
        stroke:      carrier.style.fill,
        strokeWidth: 1.8,
      },
      ...(motionCount > 0 ? { motion: true } : {}),
      endDecoration: dr.tip ?? "arrow",
      ...(typeof dr.startDelaySec === "number" && dr.startDelaySec > 0
        ? { startDelaySec: dr.startDelaySec }
        : {}),
    });
  }

  // Build Zone objects (yards → normalized; full size → half-extents).
  // Style is the SAME for every zone — matches what `mkZone` produces,
  // which is what coaches get when they drop a rect/ellipse via the
  // editor toolbar. Ignore any `color` hint from Cal: zones must read
  // as user-equivalent, so a coach can't tell a Cal-drawn zone from
  // one they drew themselves. Also clamp half-extents so a single
  // zone can't dominate the field.
  const MAX_HALF_W = 0.32;
  const MAX_HALF_H = 0.32;
  const zones: Zone[] = (diagram.zones ?? []).map((dz) => {
    const center = toNorm(dz.center?.[0] ?? 0, dz.center?.[1] ?? 0);
    const sizeW = Number.isFinite(dz.size?.[0]) ? Math.abs(dz.size[0]) : 0;
    const sizeH = Number.isFinite(dz.size?.[1]) ? Math.abs(dz.size[1]) : 0;
    const halfW = Math.min(sizeW / 2 / profile.fieldWidthYds, MAX_HALF_W);
    const halfH = Math.min(sizeH / 2 / profile.fieldLengthYds, MAX_HALF_H);
    const style = zoneStyleForOwner(dz.ownerLabel);
    return {
      id: uid(),
      kind: dz.kind,
      center,
      size: { w: halfW, h: halfH },
      label: dz.label,
      style: {
        fill: style.fill,
        stroke: style.stroke,
      },
    };
  });

  const players = allPlayers;
  const base = createEmptyPlayDocument({ sportProfile: { ...profile } });

  return {
    ...base,
    schemaVersion: PLAY_DOCUMENT_SCHEMA_VERSION,
    sportProfile: profile,
    lineOfScrimmageY: LOS_Y,
    metadata: {
      ...base.metadata,
      coachName: diagram.title ?? "",
      formation: diagram.title ?? "",
    },
    layers: {
      players,
      routes,
      annotations: [],
      zones,
    },
  };
}
