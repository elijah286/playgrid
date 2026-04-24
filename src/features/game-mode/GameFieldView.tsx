"use client";

import { useMemo } from "react";
import type { PlayDocument } from "@/domain/play/types";
import { pathGeometryToSvgD, routeToPathGeometry } from "@/domain/play/geometry";
import { resolveRouteStroke } from "@/domain/play/factory";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { AnimationOverlay } from "@/features/animation/AnimationOverlay";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";

/**
 * Read-only field renderer for game mode. Tapping the field advances the
 * playback (idle → motion → snap → reset), matching coach expectations
 * during a real game where they want to glance at the play, run it, then
 * see it freeze at end-of-play before resetting for the next call.
 *
 * When the play has no full PlayDocument (legacy plays without a current
 * version), we fall back to the static PlayThumbnail without playback.
 */
export function GameFieldView({
  document,
  fallbackPreview,
  onAdvance,
}: {
  document: PlayDocument | null;
  fallbackPreview: PlayThumbnailInput | null;
  onAdvance?: () => void;
}) {
  if (!document) {
    return (
      <button
        type="button"
        onClick={onAdvance}
        className="block size-full cursor-default appearance-none border-0 bg-transparent p-0"
        aria-label="Play"
      >
        {fallbackPreview && <PlayThumbnail preview={fallbackPreview} />}
      </button>
    );
  }
  return <GameFieldPlayback document={document} onAdvance={onAdvance} />;
}

function GameFieldPlayback({
  document,
  onAdvance,
}: {
  document: PlayDocument;
  onAdvance?: () => void;
}) {
  const anim = usePlayAnimation(document);

  const handleTap = () => {
    anim.step();
    onAdvance?.();
  };

  // Filter players so animated ones disappear from the static layer when
  // playback starts (the AnimationOverlay draws them at their tweened
  // position instead). Without this, each animated player would render
  // twice — once frozen at its start, once moving.
  const staticPlayers = useMemo(() => {
    const animatedIds = new Set(anim.flats.map((f) => f.carrierPlayerId));
    return document.layers.players.filter(
      (p) => anim.phase === "idle" || !animatedIds.has(p.id),
    );
  }, [document.layers.players, anim.flats, anim.phase]);

  // Routes use the same 0..1 coordinate system as the carousel renderer.
  // Stroke widths sized for a large viewport — these aren't the editor's
  // stroke widths because the field viewBox here is fixed at 1×1.
  const ROUTE_SW = 0.005;
  const PLAYER_R = 0.028;
  const PLAYER_SW = 0.003;
  const LABEL_FS = 0.022;

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label="Tap to advance play"
      className="relative block size-full cursor-pointer appearance-none border-0 bg-transparent p-0"
    >
      <svg
        viewBox="0 0 1 1"
        className="size-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="gameFieldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2D8B4E" />
            <stop offset="100%" stopColor="#247540" />
          </linearGradient>
        </defs>
        <rect width={1} height={1} fill="url(#gameFieldGrad)" />

        {/* Routes: drawn beneath players so tokens sit on top of their lines. */}
        {document.layers.routes.map((r) => (
          <path
            key={r.id}
            d={pathGeometryToSvgD(routeToPathGeometry(r))}
            fill="none"
            stroke={resolveRouteStroke(r, document.layers.players)}
            strokeWidth={ROUTE_SW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {staticPlayers.map((pl) => (
          <g key={pl.id}>
            <circle
              cx={pl.position.x}
              cy={1 - pl.position.y}
              r={PLAYER_R}
              fill="#FFFFFF"
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={PLAYER_SW}
            />
            <text
              x={pl.position.x}
              y={1 - pl.position.y + 0.008}
              textAnchor="middle"
              fontSize={LABEL_FS}
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
    </button>
  );
}
