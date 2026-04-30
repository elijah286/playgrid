"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ExampleBookTile,
  type ExampleBookTileData,
} from "@/features/dashboard/ExampleBookTile";

/**
 * Horizontal scroll strip of example playbooks. Native overflow-x scroll
 * with scroll-snap on every breakpoint (so swipe works on touch and the
 * mouse wheel/trackpad works on desktop). Adds prev/next buttons at md+
 * for coaches who don't realize horizontal scrolling is available — the
 * primary audience is non-technical, so the affordance matters.
 */
export function ExamplesStrip({ examples }: { examples: ExampleBookTileData[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateBounds = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateBounds();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateBounds, { passive: true });
    window.addEventListener("resize", updateBounds);
    return () => {
      el.removeEventListener("scroll", updateBounds);
      window.removeEventListener("resize", updateBounds);
    };
  }, [updateBounds]);

  const scrollByOneTile = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // Each item carries the snap point — scroll by the first item's offsetWidth
    // plus the gap, which the browser computes from getBoundingClientRect.
    const first = el.querySelector<HTMLElement>("[data-strip-item]");
    const step = first ? first.getBoundingClientRect().width + 24 /* gap-6 */ : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  if (examples.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollPaddingInline: "1.5rem" }}
        role="list"
        aria-label="Example playbooks"
      >
        {/* Spacer so the first tile can fully snap-align to the visual
            left edge of the section instead of butting against the screen. */}
        <div aria-hidden className="shrink-0 pl-2" />
        {examples.map((pb) => (
          <div
            key={pb.id}
            data-strip-item
            role="listitem"
            className="w-44 shrink-0 snap-start sm:w-52 lg:w-60"
          >
            <ExampleBookTile tile={pb} />
          </div>
        ))}
        <div aria-hidden className="shrink-0 pr-2" />
      </div>

      {/* Arrow controls — md+ only. On mobile the swipe + peek is the
          affordance and arrows would steal touch targets. */}
      {examples.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous example"
            onClick={() => scrollByOneTile(-1)}
            disabled={!canScrollLeft}
            className="absolute left-0 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-surface-raised p-2.5 shadow-md transition-opacity hover:bg-surface-inset disabled:pointer-events-none disabled:opacity-0 md:block"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next example"
            onClick={() => scrollByOneTile(1)}
            disabled={!canScrollRight}
            className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-1/2 rounded-full border border-border bg-surface-raised p-2.5 shadow-md transition-opacity hover:bg-surface-inset disabled:pointer-events-none disabled:opacity-0 md:block"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}
