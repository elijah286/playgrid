"use client";

import { useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { Player, RouteStyle } from "@/domain/play/types";
import {
  ROUTE_TEMPLATES,
  instantiateTemplate,
  type RouteTemplate,
} from "@/domain/play/routeTemplates";

type Props = {
  player: Player;
  dispatch: (c: PlayCommand) => void;
  activeStyle?: Partial<RouteStyle>;
  existingRouteIds?: readonly string[];
};

function TemplateThumbnail({ template }: { template: RouteTemplate }) {
  // Render a mini SVG preview of the route shape.
  //
  // IMPORTANT: we use a UNIFORM scale derived from the larger of the two axes
  // so that angles are preserved accurately. Independent-axis normalization
  // would make a "Post" (wide angle) and "Skinny Post" (narrow angle) look
  // identical — both stretched to fill the full box in x.
  const pts = template.points;

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  // Single scale for both axes — routes that are nearly vertical stay narrow,
  // routes that break wide fill the box. Minimum of 0.08 prevents divide-by-zero
  // on degenerate single-point routes.
  const maxRange = Math.max(rangeX, rangeY, 0.08);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const pad = 5;
  const size = 30; // drawable area inside padding

  const scaled = pts.map((p) => ({
    x: pad + size / 2 + ((p.x - centerX) / maxRange) * size,
    y: pad + size / 2 - ((p.y - centerY) / maxRange) * size, // flip y for SVG
  }));

  // Build path — use quadratic bezier for curve segments so curved routes
  // (wheel, fade, skinny post, stop-and-go) look smoother in the thumbnail.
  const pathParts: string[] = [`M ${scaled[0].x.toFixed(1)} ${scaled[0].y.toFixed(1)}`];
  for (let i = 1; i < scaled.length; i++) {
    const shape = template.shapes?.[i - 1] ?? "straight";
    const p = scaled[i];
    if (shape === "curve" && i >= 2) {
      // Use the previous point as a rough control point for a quadratic curve
      const prev = scaled[i - 1];
      pathParts.push(`Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    } else {
      pathParts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
  }
  const d = pathParts.join(" ");

  return (
    <svg viewBox={`0 0 ${size + pad * 2} ${size + pad * 2}`} className="h-10 w-10">
      {/* Player dot */}
      <circle cx={scaled[0].x} cy={scaled[0].y} r={3} fill="#94a3b8" />
      {/* Route path */}
      <path
        d={d}
        fill="none"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      <circle
        cx={scaled[scaled.length - 1].x}
        cy={scaled[scaled.length - 1].y}
        r={2}
        fill="#F26522"
      />
    </svg>
  );
}

export function QuickRoutes({ player, dispatch, activeStyle, existingRouteIds }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? ROUTE_TEMPLATES.filter((t) =>
        t.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : ROUTE_TEMPLATES;

  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Quick routes
      </h3>

      {/* Search */}
      <input
        type="search"
        placeholder="Search routes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-2 w-full rounded-md border border-border bg-surface-inset px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {filtered.length === 0 && (
          <p className="col-span-2 py-3 text-center text-[11px] text-muted">
            No routes match &ldquo;{query}&rdquo;
          </p>
        )}
        {filtered.map((template) => (
          <button
            key={template.name}
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-surface-raised"
            onClick={() => {
              // Replace any existing routes carried by this player so picking
              // a new quick route swaps the player's assignment instead of
              // piling a second route on top.
              for (const rid of existingRouteIds ?? []) {
                dispatch({ type: "route.remove", routeId: rid });
              }
              const route = instantiateTemplate(
                template,
                player.position,
                player.id,
                activeStyle,
              );
              dispatch({ type: "route.add", route });
            }}
          >
            <div className="flex-shrink-0 rounded bg-surface-dark/60">
              <TemplateThumbnail template={template} />
            </div>
            <span className="text-xs font-medium text-foreground">{template.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
