"use client";

import type { PlayDocument, Route } from "@/domain/play/types";
import { resolveRouteStroke } from "@/domain/play/factory";
import { subpathD } from "@/domain/play/animation";
import type { PlayAnimation } from "./usePlayAnimation";

type Props = {
  doc: PlayDocument;
  anim: PlayAnimation;
  fieldAspect: number;
};

/**
 * SVG overlay rendered on top of the static canvas while an animation is
 * running. Shows:
 *   - Traversed portion of each route in gray (the "trail")
 *   - Remaining portion in the original route color
 *   - Player tokens at their current sampled positions
 *
 * Designed to be rendered as a sibling <svg> absolutely positioned over the
 * existing canvas SVG, with pointer-events: none so editor interactions
 * (while paused) remain available.
 */
export function AnimationOverlay({ doc, anim, fieldAspect }: Props) {
  if (anim.phase === "idle") return null;

  const routeById = new Map<string, Route>(
    doc.layers.routes.map((r) => [r.id, r]),
  );

  return (
    <svg
      viewBox={`0 0 ${fieldAspect} 1`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <g transform={`scale(${fieldAspect}, 1)`}>
        {anim.flats.map((f) => {
          const route = routeById.get(f.routeId);
          if (!route) return null;
          const color = resolveRouteStroke(route, doc.layers.players);
          const s = anim.progress.get(f.routeId) ?? 0;

          const trailD = s > 0 ? subpathD(f, 0, s) : "";
          const remainingD = s < f.length ? subpathD(f, s, f.length) : "";

          return (
            <g key={f.routeId}>
              {trailD && (
                <path
                  d={trailD}
                  fill="none"
                  stroke="rgba(156, 163, 175, 0.55)"
                  strokeWidth={route.style.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {remainingD && (
                <path
                  d={remainingD}
                  fill="none"
                  stroke={color}
                  strokeWidth={route.style.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}

        {/* Animated player tokens. Render over routes. Players with no
            route, or whose route hasn't advanced, fall back to their
            default position. */}
        {doc.layers.players.map((p) => {
          const anim_pos = anim.playerPositions.get(p.id) ?? p.position;
          return (
            <g key={p.id}>
              <ellipse
                cx={anim_pos.x}
                cy={1 - anim_pos.y}
                rx={0.028 / fieldAspect}
                ry={0.028}
                fill={p.style.fill}
                stroke={p.style.stroke}
                strokeWidth={0.003}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={anim_pos.x}
                y={1 - anim_pos.y + 0.011}
                textAnchor="middle"
                fontSize={0.024}
                fontWeight={700}
                fill={p.style.labelColor}
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
