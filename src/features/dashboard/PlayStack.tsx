"use client";

import { useEffect, useRef, useState } from "react";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";

/** Small rotations/offsets for the fan mode. Indexed 0..3 (tightest -> widest). */
const FAN_REST = [
  { rotate: -4, x: -6, y: 4 },
  { rotate: -1, x: -2, y: 2 },
  { rotate: 2, x: 2, y: 0 },
  { rotate: 5, x: 6, y: -2 },
] as const;

const FAN_HOVER = [
  { rotate: -14, x: -60, y: 12 },
  { rotate: -5, x: -22, y: 4 },
  { rotate: 6, x: 22, y: -4 },
  { rotate: 16, x: 62, y: 12 },
] as const;

/**
 * Stack of play thumbnails for the dashboard. Two modes:
 *
 * - "fan": thumbnails fan outward on `group-hover` (CSS only).
 * - "flip": only the top thumb is visible; on hover, cycles through previews
 *   via a JS interval with a crossfade.
 *
 * Wrap the trigger (tile, hero card) in `className="group"` so `group-hover:*`
 * utilities engage.
 */
export function PlayStack({
  previews,
  mode,
  className,
}: {
  previews: PlayThumbnailInput[];
  mode: "fan" | "flip";
  className?: string;
}) {
  const items = previews.slice(0, 4);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate to skip SSR for SVG trig that differs between server/client
    setMounted(true);
  }, []);
  if (items.length === 0) return null;
  if (!mounted) {
    // Avoid hydration mismatches: the embedded SVG thumbnails compute
    // floating-point trig that can differ between SSR and client. Render
    // client-side only; the stack is purely decorative.
    return <div className={`pointer-events-none ${className ?? ""}`} aria-hidden />;
  }

  if (mode === "fan") {
    return (
      <div className={`pointer-events-none relative ${className ?? ""}`}>
        {items.map((p, i) => {
          const rest = FAN_REST[i] ?? FAN_REST[FAN_REST.length - 1];
          const hover = FAN_HOVER[i] ?? FAN_HOVER[FAN_HOVER.length - 1];
          return (
            <div
              key={i}
              className="absolute inset-0 transition-transform duration-500 ease-out drop-shadow-md"
              style={
                {
                  transform: `translate(${rest.x}px, ${rest.y}px) rotate(${rest.rotate}deg)`,
                  ["--hover-transform" as string]: `translate(${hover.x}px, ${hover.y}px) rotate(${hover.rotate}deg)`,
                } as React.CSSProperties
              }
              data-fan-card
            >
              <div className="h-full w-full overflow-hidden rounded-lg bg-white ring-1 ring-border/60">
                <PlayThumbnail preview={p} />
              </div>
            </div>
          );
        })}
        <style>{`
          .group:hover [data-fan-card] { transform: var(--hover-transform) !important; }
        `}</style>
      </div>
    );
  }

  return <FlipStack items={items} className={className} />;
}

function FlipStack({
  items,
  className,
}: {
  items: PlayThumbnailInput[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoveringRef = useRef(false);

  useEffect(() => {
    if (items.length <= 1) return;
    const el = containerRef.current;
    if (!el) return;
    // Traverse up to find the nearest `.group` (the tile) so we can listen
    // for hover on the same element the CSS `group-hover` utilities key off.
    const groupEl = el.closest(".group") as HTMLElement | null;
    if (!groupEl) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      hoveringRef.current = true;
      if (interval) return;
      interval = setInterval(() => {
        setActive((i) => (i + 1) % items.length);
      }, 700);
    };
    const stop = () => {
      hoveringRef.current = false;
      if (interval) clearInterval(interval);
      interval = null;
      setActive(0);
    };
    groupEl.addEventListener("mouseenter", start);
    groupEl.addEventListener("mouseleave", stop);
    return () => {
      groupEl.removeEventListener("mouseenter", start);
      groupEl.removeEventListener("mouseleave", stop);
      if (interval) clearInterval(interval);
    };
  }, [items.length]);

  return (
    <div ref={containerRef} className={`pointer-events-none relative ${className ?? ""}`}>
      {items.map((p, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-300 ease-out"
          style={{ opacity: i === active ? 1 : 0 }}
        >
          <div className="h-full w-full overflow-hidden rounded-md bg-white/95 ring-1 ring-border/60 shadow-sm">
            <PlayThumbnail preview={p} />
          </div>
        </div>
      ))}
    </div>
  );
}
