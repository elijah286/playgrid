"use client";

import { pathGeometryToSvgD } from "@/domain/play/geometry";
import type { PlayDocument } from "@/domain/play/types";

/** Compact preview — tap-to-animate style using SVG SMIL */
export function RouteAnimation({ doc }: { doc: PlayDocument }) {
  return (
    <svg viewBox="0 0 1 1" className="h-28 w-44 overflow-visible rounded-lg bg-white/80 ring-1 ring-slate-200/80">
      <rect width={1} height={1} fill="#f8fafc" opacity={0.9} />
      {doc.layers.routes.map((r) => {
        const d = pathGeometryToSvgD(r.geometry);
        return (
          <path
            key={r.id}
            d={d}
            fill="none"
            stroke={r.style.stroke}
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
