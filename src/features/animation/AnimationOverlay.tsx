"use client";

import type { PlayDocument, Route } from "@/domain/play/types";
import { resolveRouteStroke } from "@/domain/play/factory";
import type { PlayAnimation } from "./usePlayAnimation";

type Props = {
  doc: PlayDocument;
  anim: PlayAnimation;
  fieldAspect: number;
};

/**
 * Overlay rendered on top of the static canvas while an animation is running.
 *
 * For each route we render the exact same SVG `d` that the static canvas uses
 * (curves and all) twice: once as a gray "trail" dash-clipped to the
 * traversed arc-length, and once in the route's color dash-clipped to the
 * remaining arc-length. This guarantees the route shape is unchanged between
 * the static view and playback.
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
          if (!f.postMotionD || f.postMotionLength <= 0) return null;
          const color = resolveRouteStroke(route, doc.layers.players);
          // Progress is measured along the full route; clamp to the post-motion
          // portion for overlay rendering so pre-snap motion (rendered by the
          // static canvas as a zig-zag) isn't drawn over as a straight line.
          const raw = anim.progress.get(f.routeId) ?? 0;
          const L = f.postMotionLength;
          const s = Math.max(0, Math.min(L, raw - f.motionBoundary));

          return (
            <g key={f.routeId}>
              {/* Gray trail: visible 0 → s (dash s, gap covers the remainder) */}
              {s > 0 && (
                <path
                  d={f.postMotionD}
                  pathLength={L}
                  fill="none"
                  stroke="rgba(156, 163, 175, 0.55)"
                  strokeWidth={route.style.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${s} ${L}`}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {/* Colored remainder: visible s → L. Pattern [dash (L-s), gap s]
                  with offset (L-s) shifts the dash to start at arc-pos s. */}
              {s < L && (
                <path
                  d={f.postMotionD}
                  pathLength={L}
                  fill="none"
                  stroke={color}
                  strokeWidth={route.style.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${L - s} ${s || 0.0001}`}
                  strokeDashoffset={L - s}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}

        {/* Animated player tokens. Players without a route (or whose route
            hasn't advanced) fall back to their default position. */}
        {doc.layers.players.map((p) => {
          const pos = anim.playerPositions.get(p.id) ?? p.position;
          return (
            <g key={p.id}>
              <ellipse
                cx={pos.x}
                cy={1 - pos.y}
                rx={0.028 / fieldAspect}
                ry={0.028}
                fill={p.style.fill}
                stroke={p.style.stroke}
                strokeWidth={0.003}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={pos.x}
                y={1 - pos.y + 0.011}
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
