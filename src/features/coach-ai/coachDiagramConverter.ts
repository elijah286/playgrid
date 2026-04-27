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

// ── Team color palettes ────────────────────────────────────────────────────

const OFFENSE_FILL   = "#2563EB"; // blue-600
const OFFENSE_STROKE = "#1D4ED8"; // blue-700
const DEFENSE_FILL   = "#DC2626"; // red-600
const DEFENSE_STROKE = "#B91C1C"; // red-700
const LABEL_COLOR    = "#FFFFFF";

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
  for (const dp of diagram.players) {
    const team = guessTeam(dp);
    const norm = toNorm(dp.x, dp.y);
    const fill  = dp.color ?? (team === "O" ? OFFENSE_FILL  : DEFENSE_FILL);
    const stroke =           (team === "O" ? OFFENSE_STROKE : DEFENSE_STROKE);
    const player: Player = {
      id:       uid(),
      role:     guessRole(dp),
      label:    (dp.role ?? dp.id).slice(0, 3).toUpperCase(),
      position: norm,
      eligible: team === "O",
      style:    { fill, stroke, labelColor: LABEL_COLOR },
      shape:    dp.shape ?? "circle",
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
