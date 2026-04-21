import type { Player, Route } from "@/domain/play/types";
import type { PlayThumbnailInput } from "@/features/editor/PlayThumbnail";

function player(
  id: string,
  label: string,
  x: number,
  y: number,
  fill = "#0f172a",
): Player {
  return {
    id,
    role: "WR",
    label,
    position: { x, y },
    eligible: true,
    style: { fill, stroke: "#0f172a", labelColor: "#ffffff" },
    shape: "circle",
  };
}

function straightRoute(
  id: string,
  carrierId: string,
  points: { x: number; y: number }[],
  color = "#1d4ed8",
): Route {
  const nodes = points.map((p, i) => ({ id: `${id}-n${i}`, position: p }));
  const segments = nodes.slice(0, -1).map((n, i) => ({
    id: `${id}-s${i}`,
    fromNodeId: n.id,
    toNodeId: nodes[i + 1].id,
    shape: "straight" as const,
    strokePattern: "solid" as const,
    controlOffset: null,
  }));
  return {
    id,
    carrierPlayerId: carrierId,
    semantic: null,
    nodes,
    segments,
    style: { stroke: color, strokeWidth: 2 },
    endDecoration: "arrow",
  };
}

const LOS = 0.42;

// 1 — Four verticals (vertical routes from LOS).
export const SAMPLE_VERTICALS: PlayThumbnailInput = {
  lineOfScrimmageY: LOS,
  players: [
    player("v-qb", "Q", 0.5, LOS - 0.06, "#0ea5e9"),
    player("v-x", "X", 0.12, LOS, "#f97316"),
    player("v-z", "Z", 0.88, LOS, "#f97316"),
    player("v-y", "Y", 0.32, LOS, "#f97316"),
    player("v-h", "H", 0.68, LOS, "#f97316"),
  ],
  routes: [
    straightRoute("v-r1", "v-x", [{ x: 0.12, y: LOS }, { x: 0.12, y: LOS + 0.42 }]),
    straightRoute("v-r2", "v-y", [{ x: 0.32, y: LOS }, { x: 0.34, y: LOS + 0.42 }]),
    straightRoute("v-r3", "v-h", [{ x: 0.68, y: LOS }, { x: 0.66, y: LOS + 0.42 }]),
    straightRoute("v-r4", "v-z", [{ x: 0.88, y: LOS }, { x: 0.88, y: LOS + 0.42 }]),
  ],
};

// 2 — Slant-flat combo on both sides.
export const SAMPLE_SLANT_FLAT: PlayThumbnailInput = {
  lineOfScrimmageY: LOS,
  players: [
    player("s-qb", "Q", 0.5, LOS - 0.06, "#0ea5e9"),
    player("s-rb", "R", 0.5, LOS - 0.14, "#22c55e"),
    player("s-x", "X", 0.12, LOS, "#f97316"),
    player("s-z", "Z", 0.88, LOS, "#f97316"),
    player("s-y", "Y", 0.3, LOS, "#f97316"),
  ],
  routes: [
    straightRoute("s-r1", "s-x", [
      { x: 0.12, y: LOS },
      { x: 0.14, y: LOS + 0.08 },
      { x: 0.38, y: LOS + 0.22 },
    ]),
    straightRoute("s-r2", "s-y", [
      { x: 0.3, y: LOS },
      { x: 0.18, y: LOS + 0.06 },
    ]),
    straightRoute("s-r3", "s-z", [
      { x: 0.88, y: LOS },
      { x: 0.86, y: LOS + 0.08 },
      { x: 0.62, y: LOS + 0.22 },
    ]),
    straightRoute("s-r4", "s-rb", [
      { x: 0.5, y: LOS - 0.14 },
      { x: 0.78, y: LOS + 0.04 },
    ], "#059669"),
  ],
};

// 3 — Sweep right (RB runs outside; WRs block).
export const SAMPLE_SWEEP: PlayThumbnailInput = {
  lineOfScrimmageY: LOS,
  players: [
    player("w-qb", "Q", 0.5, LOS - 0.06, "#0ea5e9"),
    player("w-rb", "R", 0.42, LOS - 0.14, "#22c55e"),
    player("w-x", "X", 0.12, LOS, "#f97316"),
    player("w-z", "Z", 0.88, LOS, "#f97316"),
    player("w-y", "Y", 0.72, LOS, "#f97316"),
  ],
  routes: [
    straightRoute("w-r1", "w-rb", [
      { x: 0.42, y: LOS - 0.14 },
      { x: 0.58, y: LOS - 0.1 },
      { x: 0.82, y: LOS + 0.02 },
      { x: 0.9, y: LOS + 0.18 },
    ], "#059669"),
    straightRoute("w-r2", "w-y", [
      { x: 0.72, y: LOS },
      { x: 0.82, y: LOS + 0.05 },
    ]),
    straightRoute("w-r3", "w-z", [
      { x: 0.88, y: LOS },
      { x: 0.92, y: LOS + 0.08 },
    ]),
  ],
};

// 4 — Mesh (crossing routes).
export const SAMPLE_MESH: PlayThumbnailInput = {
  lineOfScrimmageY: LOS,
  players: [
    player("m-qb", "Q", 0.5, LOS - 0.06, "#0ea5e9"),
    player("m-x", "X", 0.14, LOS, "#f97316"),
    player("m-z", "Z", 0.86, LOS, "#f97316"),
    player("m-y", "Y", 0.36, LOS, "#f97316"),
    player("m-h", "H", 0.64, LOS, "#f97316"),
  ],
  routes: [
    straightRoute("m-r1", "m-x", [
      { x: 0.14, y: LOS },
      { x: 0.4, y: LOS + 0.08 },
      { x: 0.82, y: LOS + 0.14 },
    ]),
    straightRoute("m-r2", "m-z", [
      { x: 0.86, y: LOS },
      { x: 0.6, y: LOS + 0.08 },
      { x: 0.18, y: LOS + 0.14 },
    ]),
    straightRoute("m-r3", "m-y", [
      { x: 0.36, y: LOS },
      { x: 0.32, y: LOS + 0.32 },
    ]),
    straightRoute("m-r4", "m-h", [
      { x: 0.64, y: LOS },
      { x: 0.68, y: LOS + 0.32 },
    ]),
  ],
};

export const SAMPLE_FAN_PREVIEWS: PlayThumbnailInput[] = [
  SAMPLE_VERTICALS,
  SAMPLE_SLANT_FLAT,
  SAMPLE_MESH,
  SAMPLE_SWEEP,
];
