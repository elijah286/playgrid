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

export type CoachDiagram = {
  title?: string;
  variant?: string;
  players: CoachDiagramPlayer[];
  routes?: CoachDiagramRoute[];
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

const RECEIVER_ROTATION: PlayerStyle[] = [STYLE_X, STYLE_Y, STYLE_Z, STYLE_S, STYLE_H];

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

  // Build Player objects
  const playerMap = new Map<string, Player>();
  let receiverIdx = 0;
  for (const dp of diagram.players) {
    const team = guessTeam(dp);
    const norm = toNorm(dp.x, dp.y);
    const role = guessRole(dp);
    const rawLabel = (dp.role ?? dp.id).toUpperCase();

    let style: PlayerStyle;
    let label: string;
    let shape: PlayerShape;
    if (team === "D") {
      style = STYLE_DEF;
      label = rawLabel.slice(0, 3);
      shape = dp.shape ?? "triangle";
    } else if (rawLabel === "QB" || rawLabel === "Q" || role === "QB") {
      style = STYLE_QB;
      label = "Q";
      shape = dp.shape ?? "circle";
    } else if (rawLabel === "C" || role === "C") {
      style = STYLE_C;
      label = "C";
      shape = dp.shape ?? "circle";
    } else if (rawLabel === "X") { style = STYLE_X; label = "X"; shape = dp.shape ?? "circle"; }
    else if (rawLabel === "Y" || rawLabel === "TE" || role === "TE") { style = STYLE_Y; label = "Y"; shape = dp.shape ?? "circle"; }
    else if (rawLabel === "Z") { style = STYLE_Z; label = "Z"; shape = dp.shape ?? "circle"; }
    else if (rawLabel === "S" || rawLabel === "A") { style = STYLE_S; label = rawLabel.slice(0, 1); shape = dp.shape ?? "circle"; }
    else if (rawLabel === "H" || rawLabel === "F" || rawLabel === "B" || rawLabel === "RB" || role === "RB") {
      style = STYLE_H; label = rawLabel === "RB" ? "B" : rawLabel.slice(0, 1); shape = dp.shape ?? "circle";
    } else {
      // Generic offensive skill (WR, WR1, WR2, slot, etc.) — rotate palette.
      style = RECEIVER_ROTATION[receiverIdx % RECEIVER_ROTATION.length];
      receiverIdx += 1;
      label = rawLabel.slice(0, 3);
      shape = dp.shape ?? "circle";
    }

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
      zones: [],
    },
  };
}
