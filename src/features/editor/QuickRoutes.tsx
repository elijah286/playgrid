"use client";

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
};

function TemplateThumbnail({ template }: { template: RouteTemplate }) {
  // Render a mini SVG preview of the route shape
  const pts = template.points;
  // Normalize to fit in a 40x40 viewbox centered
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const rangeX = maxX - minX || 0.1;
  const rangeY = maxY - minY || 0.1;
  const pad = 4;
  const size = 32;

  const scaled = pts.map((p) => ({
    x: pad + ((p.x - minX) / rangeX) * size,
    y: pad + (1 - (p.y - minY) / rangeY) * size, // flip y for SVG
  }));

  const d = scaled.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

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
      {/* Endpoint arrow/dot */}
      <circle
        cx={scaled[scaled.length - 1].x}
        cy={scaled[scaled.length - 1].y}
        r={2}
        fill="#F26522"
      />
    </svg>
  );
}

export function QuickRoutes({ player, dispatch, activeStyle }: Props) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Quick routes
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {ROUTE_TEMPLATES.map((template) => (
          <button
            key={template.name}
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-surface-raised"
            onClick={() => {
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
