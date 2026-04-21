"use client";

import type { PlayDocument, Player, Point2 } from "@/domain/play/types";
import type { PlayAnimation } from "./usePlayAnimation";

type Props = {
  doc: PlayDocument;
  anim: PlayAnimation;
  fieldAspect: number;
};

/**
 * Overlay rendered on top of the static canvas during playback.
 *
 * The static canvas keeps drawing the full play unchanged (routes,
 * decorations, zones, defense, non-animating players). This overlay just
 * moves the player tokens along their routes — no trail, no route
 * modifications. Previous attempts at a gray trail caused aliasing on the
 * route itself and bled into adjacent field artwork (yard numbers, LOS).
 *
 * Player tokens are rendered with the same shape/style as the static token
 * so there is no visual pop when playback starts.
 */
export function AnimationOverlay({ doc, anim, fieldAspect }: Props) {
  if (anim.phase === "idle") return null;

  const playerById = new Map<string, Player>(
    doc.layers.players.map((p) => [p.id, p]),
  );

  return (
    <svg
      viewBox={`0 0 ${fieldAspect} 1`}
      preserveAspectRatio="xMidYMin meet"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {anim.flats.map((f) => {
        const pl = playerById.get(f.carrierPlayerId);
        if (!pl) return null;
        const pos: Point2 = anim.playerPositions.get(pl.id) ?? pl.position;
        return renderPlayerToken(pl, pos, fieldAspect);
      })}
    </svg>
  );
}

/**
 * Render a player token matching the static EditorCanvas render: same shape,
 * same radius, same fill/stroke/label colors. Positioned in scaled field
 * coords (wrapper applies x-aspect scaling).
 */
function renderPlayerToken(pl: Player, pos: Point2, fieldAspect: number) {
  const r = 0.028;
  const px = pos.x * fieldAspect;
  const py = 1 - pos.y;
  const fillColor = pl.style?.fill ?? "#FFFFFF";
  const strokeColor = pl.style?.stroke ?? "rgba(0,0,0,0.6)";
  const labelColor = readableLabelColor(fillColor, pl.style?.labelColor);
  const shape = pl.shape ?? "circle";

  let shapeEl: React.ReactNode;
  if (shape === "circle") {
    shapeEl = (
      <circle
        cx={px}
        cy={py}
        r={r}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (shape === "square") {
    shapeEl = (
      <rect
        x={px - r}
        y={py - r}
        width={r * 2}
        height={r * 2}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (shape === "diamond") {
    const pts = `${px},${py - r} ${px + r},${py} ${px},${py + r} ${px - r},${py}`;
    shapeEl = (
      <polygon
        points={pts}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (shape === "star") {
    const outer = r * 1.15;
    const inner = outer * 0.45;
    const pts = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? outer : inner;
      return `${px + rad * Math.cos(angle)},${py + rad * Math.sin(angle)}`;
    }).join(" ");
    shapeEl = (
      <polygon
        points={pts}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  } else {
    const pts = `${px},${py + r} ${px + r},${py - r} ${px - r},${py - r}`;
    shapeEl = (
      <polygon
        points={pts}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return (
    <g key={pl.id}>
      {shapeEl}
      <text
        x={px}
        y={py + 0.01}
        textAnchor="middle"
        fontSize={0.022}
        fontWeight={700}
        fill={labelColor}
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      >
        {pl.label}
      </text>
    </g>
  );
}

function parseColor(c: string): { r: number; g: number; b: number } | null {
  const s = c.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full = hex.length === 3 ? hex.split("").map((h) => h + h).join("") : hex;
    if (full.length !== 6) return null;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2] };
  }
  return null;
}

function readableLabelColor(fill: string, preferred?: string): string {
  const rgb = parseColor(fill);
  if (!rgb) return preferred ?? "#1C1C1E";
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const auto = lum < 0.55 ? "#FFFFFF" : "#1C1C1E";
  if (!preferred) return auto;
  const pRgb = parseColor(preferred);
  if (!pRgb) return auto;
  const pLum = (0.299 * pRgb.r + 0.587 * pRgb.g + 0.114 * pRgb.b) / 255;
  if (Math.abs(pLum - lum) < 0.35) return auto;
  return preferred;
}
