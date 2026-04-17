"use client";

import { pathGeometryToSvgD, routeToPathGeometry } from "@/domain/play/geometry";
import type { PlayDocument } from "@/domain/play/types";

/** Compact preview — tap-to-animate style using SVG SMIL */
export function RouteAnimation({ doc }: { doc: PlayDocument }) {
  return (
    <svg viewBox="0 0 1 1" className="h-28 w-44 overflow-visible rounded-lg bg-surface-dark/80 ring-1 ring-border">
      <defs>
        <linearGradient id="animFieldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2D8B4E" />
          <stop offset="100%" stopColor="#247540" />
        </linearGradient>
      </defs>
      <rect width={1} height={1} fill="url(#animFieldGrad)" opacity={0.9} />
      {doc.layers.routes.map((r) => {
        const geometry = routeToPathGeometry(r);
        const d = pathGeometryToSvgD(geometry);
        return (
          <path
            key={r.id}
            d={d}
            fill="none"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth={0.006}
            strokeDasharray="0.08 0.04"
            strokeLinecap="round"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0.5"
              to="0"
              dur={`${(doc.timeline?.durationMs ?? 2800) / 1000}s`}
              repeatCount="indefinite"
            />
          </path>
        );
      })}
    </svg>
  );
}
