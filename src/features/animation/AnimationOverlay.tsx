"use client";

import type { PlayDocument, Player, Point2 } from "@/domain/play/types";
import { deriveLabelColor } from "@/domain/play/labelColor";
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
      // Promote the overlay to its own compositor layer so its 60fps repaints
      // don't invalidate the (memoized) canvas beneath it, which would cause
      // routes, yard numbers, and LOS dashes to flicker during playback.
      style={{ willChange: "transform", transform: "translateZ(0)" }}
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
  // Shape geometry is defined around the ORIGIN so the only thing that changes
  // per frame is the parent <g>'s translate() — browsers can promote transform
  // changes to the compositor and avoid re-painting the whole SVG. Updating
  // cx/cy/x/y attributes instead would cause full-SVG paint invalidation,
  // which is what made adjacent field elements (routes, yard numbers, LOS)
  // appear to flicker during playback.
  const r = 0.028;
  const tx = pos.x * fieldAspect;
  const ty = 1 - pos.y;
  const fillColor = pl.style?.fill ?? "#FFFFFF";
  const strokeColor = pl.style?.stroke ?? "rgba(0,0,0,0.6)";
  const labelColor = deriveLabelColor(fillColor);
  const shape = pl.shape ?? "circle";

  let shapeEl: React.ReactNode;
  if (shape === "circle") {
    shapeEl = (
      <circle cx={0} cy={0} r={r} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    );
  } else if (shape === "square") {
    shapeEl = (
      <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    );
  } else if (shape === "diamond") {
    const pts = `0,${-r} ${r},0 0,${r} ${-r},0`;
    shapeEl = (
      <polygon points={pts} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    );
  } else if (shape === "star") {
    const outer = r * 1.15;
    const inner = outer * 0.45;
    const pts = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? outer : inner;
      return `${rad * Math.cos(angle)},${rad * Math.sin(angle)}`;
    }).join(" ");
    shapeEl = (
      <polygon points={pts} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    );
  } else {
    const pts = `0,${r} ${r},${-r} ${-r},${-r}`;
    shapeEl = (
      <polygon points={pts} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    );
  }

  return (
    <g key={pl.id} transform={`translate(${tx} ${ty})`}>
      {shapeEl}
      <text
        x={0}
        y={0.01}
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

