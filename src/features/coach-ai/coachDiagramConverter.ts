/**
 * Converts a lightweight Coach AI diagram JSON (easy for the LLM to emit)
 * into a full PlayDocument that can be rendered + animated.
 *
 * Coordinate system the AI uses:
 *   x = yards from center (negative = left, positive = right)
 *   y = yards from LOS    (negative = backfield, positive = upfield / downfield)
 */

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
  type SportVariant,
  type Zone,
} from "@/domain/play/types";

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
  path: [number, number][];         // waypoints as [x_yards, y_yards] (same coord system)
  curve?: boolean;
  tip?: "arrow" | "t" | "none";
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

// ── Style palettes (mirror src/domain/play/factory.ts styleForRole) ───────
//
// Field is green (#2D8B4E), so route stroke = player fill must contrast.
// Defenders: red triangle. Offense: position-based color, falling back to a
// rotating palette so multiple receivers get distinct colors.

type PlayerStyle = { fill: string; stroke: string; labelColor: string };

const STYLE_QB:   PlayerStyle = { fill: "#FFFFFF", stroke: "#0f172a", labelColor: "#1C1C1E" };
const STYLE_C:    PlayerStyle = { fill: "#1C1C1E", stroke: "#0f172a", labelColor: "#FFFFFF" };
const STYLE_X:    PlayerStyle = { fill: "#EF4444", stroke: "#7f1d1d", labelColor: "#FFFFFF" };
const STYLE_Y:    PlayerStyle = { fill: "#22C55E", stroke: "#166534", labelColor: "#FFFFFF" };
const STYLE_Z:    PlayerStyle = { fill: "#3B82F6", stroke: "#1e3a8a", labelColor: "#FFFFFF" };
const STYLE_S:    PlayerStyle = { fill: "#FACC15", stroke: "#854d0e", labelColor: "#1C1C1E" };
const STYLE_H:    PlayerStyle = { fill: "#F26522", stroke: "#7c2d12", labelColor: "#FFFFFF" };
const STYLE_DEF:  PlayerStyle = { fill: "#EF4444", stroke: "#991b1b", labelColor: "#FFFFFF" };
// Interior offensive linemen are ineligible — they should be visually muted so
// skill-position routes pop. Gray, neutral.
const STYLE_LINEMAN: PlayerStyle = { fill: "#94A3B8", stroke: "#475569", labelColor: "#0f172a" };
// Non-focus side — when the diagram focuses on offense, all defenders render
// in this very-muted gray so they're visible-as-context without competing
// with the offense (and vice versa for defense-focused diagrams).
const STYLE_NON_FOCUS: PlayerStyle = { fill: "#CBD5E1", stroke: "#94A3B8", labelColor: "#475569" };

const RECEIVER_ROTATION: PlayerStyle[] = [STYLE_X, STYLE_Y, STYLE_Z, STYLE_S, STYLE_H];

// Labels for interior O-line — gets the muted-gray treatment regardless of
// position-rotation order.
const LINEMAN_LABELS = new Set([
  "LT", "LG", "RG", "RT", "T", "G", "OL",
  "LT1", "LG1", "RG1", "RT1",
]);

// Translucent zone palette — readable on the green field, distinct per zone.
// Matches feel of EditorCanvas zones: dashed stroke, low-opacity fill.
const ZONE_PALETTE: { fill: string; stroke: string }[] = [
  { fill: "rgba(250, 204, 21, 0.22)",  stroke: "rgba(250, 204, 21, 0.85)"  }, // amber
  { fill: "rgba(96, 165, 250, 0.22)",  stroke: "rgba(96, 165, 250, 0.85)"  }, // blue
  { fill: "rgba(244, 114, 182, 0.22)", stroke: "rgba(244, 114, 182, 0.85)" }, // pink
  { fill: "rgba(167, 139, 250, 0.22)", stroke: "rgba(167, 139, 250, 0.85)" }, // violet
  { fill: "rgba(45, 212, 191, 0.22)",  stroke: "rgba(45, 212, 191, 0.85)"  }, // teal
  { fill: "rgba(251, 146, 60, 0.22)",  stroke: "rgba(251, 146, 60, 0.85)"  }, // orange
];

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

// ── Main converter ──────────────────────────────────────────────────────────

export function coachDiagramToPlayDocument(diagram: CoachDiagram): PlayDocument {
  const variant = resolveVariant(diagram.variant);
  const profile = sportProfileForVariant(variant);
  const LOS_Y = 0.4; // normalized LOS position in the 25-yard window

  /** Convert AI yards → normalized field coords */
  function toNorm(xYds: number, yYds: number): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(1, 0.5 + xYds / profile.fieldWidthYds)),
      y: Math.max(0, Math.min(1, LOS_Y + yYds / profile.fieldLengthYds)),
    };
  }

  /**
   * Defenders MUST be on their side of the ball (y ≥ 1 yard downfield from
   * LOS). Models occasionally place a defender at y=0 or y<0 — render them
   * stacked into the offense, which looks broken. Hard-clamp at the boundary.
   */
  const MIN_DEFENDER_Y_YDS = 1;

  // Default focus: offense (most common request). Defense diagrams must
  // explicitly opt in via diagram.focus = "D".
  const focus: "O" | "D" = diagram.focus === "D" ? "D" : "O";

  // Build Player objects
  const playerMap = new Map<string, Player>();
  let receiverIdx = 0;
  for (const dp of diagram.players) {
    const team = guessTeam(dp);
    const clampedY = team === "D" ? Math.max(MIN_DEFENDER_Y_YDS, dp.y) : dp.y;
    const norm = toNorm(dp.x, clampedY);
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
      style = isFocus ? STYLE_DEF : STYLE_NON_FOCUS;
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
      } else if (rawLabel === "X") { style = STYLE_X; label = "X"; }
      else if (rawLabel === "Y" || rawLabel === "TE" || role === "TE") { style = STYLE_Y; label = "Y"; }
      else if (rawLabel === "Z") { style = STYLE_Z; label = "Z"; }
      else if (rawLabel === "S" || rawLabel === "A") { style = STYLE_S; label = rawLabel.slice(0, 1); }
      else if (rawLabel === "H" || rawLabel === "F" || rawLabel === "B" || rawLabel === "RB" || role === "RB") {
        style = STYLE_H;
        label = rawLabel === "RB" ? "B" : rawLabel.slice(0, 1);
      } else {
        // Generic offensive skill (WR, WR1, slot, etc.) — rotate palette.
        style = RECEIVER_ROTATION[receiverIdx % RECEIVER_ROTATION.length];
        receiverIdx += 1;
        // Hard 2-char limit — matches the play editor.
        label = rawLabel.slice(0, 2);
      }
      // Non-focus offense overrides position-derived style.
      if (!isFocus) style = STYLE_NON_FOCUS;
    }

    // Only honor the model's explicit `color` override on the focus side —
    // non-focus side stays muted regardless of what the model emitted.
    if (dp.color && isFocus) style = { ...style, fill: dp.color };

    const player: Player = {
      id:       uid(),
      role,
      label,
      position: norm,
      eligible: team === "O",
      style,
      shape,
    };
    playerMap.set(dp.id, player);
  }

  // Build Route objects
  const routes: Route[] = [];
  for (const dr of diagram.routes ?? []) {
    const carrier = playerMap.get(dr.from);
    if (!carrier) continue;

    // Nodes: start from player position, then each waypoint
    const startNode: RouteNode = { id: uid(), position: { ...carrier.position } };
    const waypointNodes: RouteNode[] = dr.path.map(([wx, wy]) => ({
      id:       uid(),
      position: toNorm(wx, wy),
    }));
    const nodes = [startNode, ...waypointNodes];

    // Segments: each consecutive pair
    const segments: RouteSegment[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      segments.push({
        id:            uid(),
        fromNodeId:    nodes[i].id,
        toNodeId:      nodes[i + 1].id,
        shape:         dr.curve ? "curve" : "straight",
        strokePattern: "solid",
        controlOffset: null,
      });
    }
    if (segments.length === 0) continue;

    routes.push({
      id:              uid(),
      carrierPlayerId: carrier.id,
      semantic:        null,
      nodes,
      segments,
      style: {
        stroke:      carrier.style.fill,
        strokeWidth: 1.8,
      },
      endDecoration: dr.tip ?? "arrow",
    });
  }

  // Build Zone objects (yards → normalized; full size → half-extents).
  const zones: Zone[] = (diagram.zones ?? []).map((dz, i) => {
    const palette = ZONE_PALETTE[i % ZONE_PALETTE.length];
    const center = toNorm(dz.center[0], dz.center[1]);
    const halfW = Math.abs(dz.size[0]) / 2 / profile.fieldWidthYds;
    const halfH = Math.abs(dz.size[1]) / 2 / profile.fieldLengthYds;
    return {
      id: uid(),
      kind: dz.kind,
      center,
      size: { w: halfW, h: halfH },
      label: dz.label,
      style: {
        fill: dz.color ?? palette.fill,
        stroke: dz.color ?? palette.stroke,
      },
    };
  });

  const players = [...playerMap.values()];
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
