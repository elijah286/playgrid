"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SegmentShape } from "@/domain/play/types";

// Persist the grid's scroll offset across route navigations so clicking
// a route deep in the list doesn't snap the user back to the top of
// the sidebar on the next page. The list is identical on every route
// page, so a single shared key is fine.
const SCROLL_STORAGE_KEY = "library:routes:grid-scroll";

export type RouteGridItem = {
  name: string;
  slug: string;
  points: Array<{ x: number; y: number }>;
  shapes?: readonly SegmentShape[];
};

function RouteThumbnail({
  points,
  shapes,
}: {
  points: Array<{ x: number; y: number }>;
  shapes?: readonly SegmentShape[];
}) {
  if (points.length === 0) return null;

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const maxRange = Math.max(maxX - minX, maxY - minY, 0.08);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const pad = 5;
  const size = 30;

  const scaled = points.map((p) => ({
    x: pad + size / 2 + ((p.x - centerX) / maxRange) * size,
    y: pad + size / 2 - ((p.y - centerY) / maxRange) * size,
  }));

  const pathParts: string[] = [`M ${scaled[0].x.toFixed(1)} ${scaled[0].y.toFixed(1)}`];
  for (let i = 1; i < scaled.length; i++) {
    const shape = shapes?.[i - 1] ?? "straight";
    const p = scaled[i];
    if (shape === "curve" && i >= 2) {
      const prev = scaled[i - 1];
      pathParts.push(
        `Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      );
    } else {
      pathParts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
  }

  return (
    <svg viewBox={`0 0 ${size + pad * 2} ${size + pad * 2}`} className="h-9 w-9">
      <circle cx={scaled[0].x} cy={scaled[0].y} r={3} fill="#94a3b8" />
      <path
        d={pathParts.join(" ")}
        fill="none"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={scaled[scaled.length - 1].x}
        cy={scaled[scaled.length - 1].y}
        r={2}
        fill="#F26522"
      />
    </svg>
  );
}

export function RouteGrid({
  routes,
  currentSlug,
}: {
  routes: RouteGridItem[];
  currentSlug: string;
}) {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // On mount, restore the scroll position from the previous page (if
  // any). This runs once the scroll container is in the DOM. The
  // outer page's scroll position is handled by Next.js routing — we
  // only manage the sidebar's internal scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (stored && scrollRef.current) {
      scrollRef.current.scrollTop = Number(stored) || 0;
    }
  }, []);

  // Capture the scroll position right before a Link triggers
  // navigation. onClick fires synchronously before the navigation
  // commits, so the write to sessionStorage is durable by the time
  // the next page mounts.
  const handleLinkClick = () => {
    if (typeof window === "undefined" || !scrollRef.current) return;
    window.sessionStorage.setItem(
      SCROLL_STORAGE_KEY,
      String(scrollRef.current.scrollTop),
    );
  };

  const filtered = query.trim()
    ? routes.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    : routes;

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-3">
      <input
        type="search"
        placeholder="Search routes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2.5 w-full rounded-lg border border-border bg-surface-inset px-3 py-1.5 text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
      <div
        ref={scrollRef}
        className="grid grid-cols-2 gap-1.5 max-h-[480px] overflow-y-auto pr-0.5"
      >
        {filtered.map((r) => {
          const isCurrent = r.slug === currentSlug;
          return (
            <Link
              key={r.slug}
              href={`/learn/library/routes/${r.slug}`}
              onClick={handleLinkClick}
              className={
                "flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-xs font-medium transition-colors " +
                (isCurrent
                  ? "border-primary/50 bg-primary-light text-primary pointer-events-none"
                  : "border-border bg-surface-inset text-foreground hover:border-primary/40 hover:bg-surface-raised")
              }
              aria-current={isCurrent ? "page" : undefined}
            >
              <div className="flex-shrink-0 rounded bg-surface-dark/60">
                <RouteThumbnail points={r.points} shapes={r.shapes} />
              </div>
              <span className="leading-tight">{r.name}</span>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-2 py-4 text-center text-xs text-muted">No routes match.</p>
        )}
      </div>
    </div>
  );
}
