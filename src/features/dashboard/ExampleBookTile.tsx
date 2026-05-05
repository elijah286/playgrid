"use client";

/**
 * Book-cover tile for the /examples page. Visually matches the lobby's
 * PlaybookBookTile (closed book → opens on hover revealing 12 play
 * thumbnails across two pages), minus the action menu and any edit
 * affordances. Clicking routes to /playbooks/[id] where the visitor-
 * preview mode takes over.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Player, Route, Zone } from "@/domain/play/types";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";

export type ExampleBookTileData = {
  id: string;
  name: string;
  season: string | null;
  logo_url: string | null;
  color: string | null;
  play_count: number;
  author_label: string | null;
  previews: {
    players: Player[];
    routes: Route[];
    zones: Zone[];
    lineOfScrimmageY: number;
  }[];
};

const DEFAULT_COLORS = ["#F26522", "#3B82F6", "#22C55E", "#EF4444", "#A855F7", "#EAB308"];

function colorFor(tile: ExampleBookTileData): string {
  if (tile.color) return tile.color;
  let h = 0;
  for (let i = 0; i < tile.id.length; i++) h = (h * 31 + tile.id.charCodeAt(i)) >>> 0;
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length];
}

export function ExampleBookTile({
  tile,
  centerOnOpen = false,
}: {
  tile: ExampleBookTileData;
  centerOnOpen?: boolean;
}) {
  const color = colorFor(tile);
  const initials =
    tile.name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- skip SSR for SVG trig
    setMounted(true);
  }, []);

  const thickness = Math.min(6, Math.max(2, Math.round(tile.play_count / 4)));
  // Fill all 12 inside-page slots. If there are fewer unique plays than
  // slots, cycle through them and flip every other repeat horizontally so
  // the page still reads as a full playsheet.
  const hasPreviews = tile.previews.length > 0;
  const sheetPlays: { play: ExampleBookTileData["previews"][number]; flipped: boolean }[] =
    hasPreviews
      ? Array.from({ length: 12 }, (_, i) => {
          const idx = i % tile.previews.length;
          const cycle = Math.floor(i / tile.previews.length);
          return { play: tile.previews[idx], flipped: cycle % 2 === 1 };
        })
      : [];
  const [hover, setHover] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Touch devices fire synthetic mouseenter on tap, which would briefly
  // play the open-book animation before navigation — distracting and
  // pointless when there's no hover. Gate the handlers so a tap is just
  // a click straight to the playbook.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from matchMedia
    setIsTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function handleEnter() {
    const el = wrapperRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const SCALE = 1.35;
      const W = r.width * SCALE;
      const cx = r.left + r.width / 2;
      // Open book spans from (cx - 1.5W) to (cx + 0.5W); visual center
      // sits at (cx - 0.5W) — i.e. one half-page to the left of the
      // closed tile's center.
      const openCenter = cx - 0.5 * W;
      const openLeft = cx - 1.5 * W;
      const openRight = cx + 0.5 * W;
      const MARGIN = 16;
      let shift: number;
      if (centerOnOpen) {
        shift = window.innerWidth / 2 - openCenter;
      } else if (openLeft < MARGIN) {
        shift = MARGIN - openLeft;
      } else if (openRight > window.innerWidth - MARGIN) {
        shift = window.innerWidth - MARGIN - openRight;
      } else {
        shift = 0;
      }
      setShiftX(shift);
    }
    setHover(true);
  }

  function handleLeave() {
    setHover(false);
    setShiftX(0);
  }

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={isTouch ? undefined : handleEnter}
      onMouseLeave={isTouch ? undefined : handleLeave}
      className="group relative z-0"
      style={{ zIndex: hover ? 20 : 0 }}
    >
      <div
        className="transition-transform duration-150 ease-out"
        style={{
          transform: hover
            ? `translate3d(${shiftX}px, 0, 0)`
            : "translate3d(0, 0, 0)",
        }}
      >
        <div
          className="transition-transform duration-500 ease-out"
          style={{
            perspective: "1600px",
            transform: hover
              ? "translate3d(0, -8px, 0) scale(1.35)"
              : "translate3d(0, 0, 0) scale(1)",
          }}
        >
          <Link
            href={`/playbooks/${tile.id}`}
            className="relative block aspect-[3/4] w-full"
          >
            <div
              className="absolute inset-0 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border transition-opacity duration-500 ease-out"
              style={{ opacity: hover ? 1 : 0 }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-3 top-0 flex flex-col gap-[1px] py-0.5"
              >
                {Array.from({ length: thickness }).map((_, i) => (
                  <div
                    key={i}
                    className="h-px rounded-full bg-gradient-to-r from-transparent via-border to-transparent"
                    style={{ opacity: 1 - i * 0.12 }}
                  />
                ))}
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/15 to-transparent"
              />
              <div className="flex h-full w-full p-2">
                <PlaysheetColumn
                  slots={sheetPlays.slice(6, 12)}
                  blanks={hasPreviews ? 0 : 6}
                  mounted={mounted}
                />
              </div>
              {!hasPreviews && mounted && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
                  <div className="flex flex-col items-center gap-1">
                    <Plus className="size-5 opacity-60" />
                    <span>No offensive plays yet</span>
                  </div>
                </div>
              )}
            </div>

            <div
              className="absolute inset-0 rounded-xl transition-transform duration-700"
              style={{
                transform: hover ? "rotateY(-180deg)" : "rotateY(0deg)",
                transformOrigin: "left center",
                transformStyle: "preserve-3d",
                transitionTimingFunction: "cubic-bezier(.25,.75,.35,1)",
              }}
            >
              <div
                className="absolute inset-0 rounded-xl shadow-elevated ring-1 ring-black/10"
                style={{
                  backgroundColor: color,
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-2 rounded-l-xl bg-gradient-to-r from-black/40 to-transparent"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-2 right-0 flex w-1 flex-col gap-[1px]"
                >
                  {Array.from({ length: thickness }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-white/55"
                      style={{ opacity: 1 - i * 0.1 }}
                    />
                  ))}
                </div>
                <div className="flex h-full flex-col justify-between p-5 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                    Example
                  </span>
                  <div className="flex flex-1 items-center justify-center">
                    {tile.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tile.logo_url}
                        alt=""
                        className="h-36 w-36 object-contain drop-shadow"
                      />
                    ) : (
                      <span className="text-8xl font-black tracking-tight drop-shadow">
                        {initials}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-extrabold leading-tight drop-shadow-sm">
                      {tile.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs font-medium text-white/80">
                      {tile.season ? `${tile.season} · ` : ""}
                      {tile.play_count} play{tile.play_count === 1 ? "" : "s"}
                    </p>
                    {tile.author_label && (
                      <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-white/60">
                        By {tile.author_label}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="absolute inset-0 overflow-hidden rounded-xl bg-surface shadow-elevated ring-1 ring-border"
                style={{
                  transform: "rotateY(180deg)",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-black/15 to-transparent"
                />
                <div className="flex h-full w-full p-2">
                  <PlaysheetColumn
                    slots={sheetPlays.slice(0, 6)}
                    blanks={hasPreviews ? 0 : 6}
                    mounted={mounted}
                  />
                </div>
              </div>
            </div>
            {hasPreviews && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-full right-0 z-30 flex items-center justify-center transition-opacity duration-300"
                style={{ opacity: hover ? 1 : 0 }}
              >
                <div className="rounded-full border-2 border-slate-900 bg-white px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-900 shadow-lg">
                  {tile.name}
                </div>
              </div>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}

function PlaysheetColumn({
  slots,
  blanks,
  mounted,
}: {
  slots: {
    play: { players: Player[]; routes: Route[]; zones: Zone[]; lineOfScrimmageY: number };
    flipped: boolean;
  }[];
  blanks: number;
  mounted: boolean;
}) {
  return (
    <div className="grid flex-1 grid-cols-2 grid-rows-3 gap-1.5">
      {mounted &&
        slots.map((s, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-sm bg-white ring-1 ring-border/70"
            style={s.flipped ? { transform: "scaleX(-1)" } : undefined}
          >
            <PlayThumbnail preview={s.play} thin light />
          </div>
        ))}
      {Array.from({ length: blanks }).map((_, i) => (
        <div
          key={`blank-${i}`}
          className="rounded-sm border border-dashed border-border/70 bg-surface-inset/40"
        />
      ))}
    </div>
  );
}
