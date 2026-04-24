"use client";

import type { PlayDocument } from "@/domain/play/types";
import { pathGeometryToSvgD, routeToPathGeometry } from "@/domain/play/geometry";
import { resolveRouteStroke } from "@/domain/play/factory";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { PlayControls } from "@/features/animation/PlayControls";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";

/**
 * Read-only field renderer for game mode. Mirrors the mobile viewer's
 * carousel field exactly — same SVG, same AnimationOverlay, same floating
 * PlayControls — so coaches get the playback they're already used to.
 */
export function GameFieldView({
  document,
  fallbackPreview,
}: {
  document: PlayDocument | null;
  fallbackPreview: PlayThumbnailInput | null;
}) {
  if (!document) {
    return (
      <div className="flex size-full items-center justify-center">
        {fallbackPreview && <PlayThumbnail preview={fallbackPreview} />}
      </div>
    );
  }
  return <GameFieldPlayback document={document} />;
}

function GameFieldPlayback({ document }: { document: PlayDocument }) {
  const anim = usePlayAnimation(document);

  return (
    <div className="relative mx-auto aspect-[4/3] h-full max-h-full w-auto max-w-full overflow-hidden rounded-xl shadow-card">
      <svg viewBox="0 0 1 1" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gameFieldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2D8B4E" />
            <stop offset="100%" stopColor="#247540" />
          </linearGradient>
        </defs>
        <rect width={1} height={1} fill="url(#gameFieldGrad)" />
        {document.layers.routes.map((r) => (
          <path
            key={r.id}
            d={pathGeometryToSvgD(routeToPathGeometry(r))}
            fill="none"
            stroke={resolveRouteStroke(r, document.layers.players)}
            strokeWidth={0.004}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {document.layers.players
          .filter((pl) => {
            if (anim.phase === "idle") return true;
            return !anim.flats.some((f) => f.carrierPlayerId === pl.id);
          })
          .map((pl) => (
            <g key={pl.id}>
              <circle
                cx={pl.position.x}
                cy={1 - pl.position.y}
                r={0.03}
                fill="#FFFFFF"
                stroke="rgba(0,0,0,0.2)"
                strokeWidth={0.003}
              />
              <text
                x={pl.position.x}
                y={1 - pl.position.y + 0.01}
                textAnchor="middle"
                fontSize={0.022}
                fontWeight={700}
                fill="#1C1C1E"
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {pl.label}
              </text>
            </g>
          ))}
      </svg>
      <AnimationOverlay doc={document} anim={anim} fieldAspect={1} />
      <PlayControls anim={anim} />
    </div>
  );
}
