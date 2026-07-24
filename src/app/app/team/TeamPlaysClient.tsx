"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListChecks, Search, StickyNote } from "lucide-react";
import type { PlayType } from "@/domain/play/types";
import type { PlaybookDetailPlayRow } from "@/app/actions/plays";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { PlayShareToggle } from "./PlayShareToggle";
import {
  TYPE_LABEL,
  filterPlays,
  groupPlaysOffenseFirst,
  presentPlayTypes,
} from "./team-plays-grouping";

/**
 * The team's play library, restored to production parity inside the shell:
 * search + a play-type filter, plays GROUPED by type in offense-first order
 * (the flat grid was dropping both), and a bordered card that surfaces the
 * play's glyphs — type badge, formation/shorthand, tag chips, notes marker —
 * instead of just a thumbnail. The name stays UNDER the thumbnail (the shell's
 * preference) rather than above it as the production card does.
 *
 * Same data (`listPlaysAction`) and same canonical `PlayThumbnail` render path
 * the production grid uses — this is a re-composition, not a fork. Grouping +
 * filter logic lives in team-plays-grouping.ts (unit-tested).
 */

// Compact colored glyph per type — matches PlayTypeBadge in the production grid.
const TYPE_BADGE: Record<PlayType, { label: string; className: string }> = {
  offense: { label: "OFF", className: "bg-primary/10 text-primary" },
  defense: { label: "DEF", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
  special_teams: {
    label: "ST",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  practice_plan: {
    label: "DRILL",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
};

export function TeamPlaysClient({
  plays,
  canEdit,
}: {
  plays: PlaybookDetailPlayRow[];
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<PlayType | "all">("all");

  // The type-filter chips only offer types actually present, in offense-first
  // order — so a flag team never sees a "Special Teams" filter it can't use.
  const presentTypes = useMemo(() => presentPlayTypes(plays), [plays]);
  const filtered = useMemo(() => filterPlays(plays, q, typeFilter), [plays, q, typeFilter]);
  const sections = useMemo(() => groupPlaysOffenseFirst(filtered), [filtered]);

  return (
    <div className="space-y-4">
      {/* Controls: search + type filter (the "sort and filter" the flat grid
          lost). Only show the type chips when there's more than one type. */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search plays…"
            aria-label="Search plays"
            className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>

        {presentTypes.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto overflow-y-hidden px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
              All
            </FilterChip>
            {presentTypes.map((t) => (
              <FilterChip
                key={t}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
              >
                {TYPE_LABEL[t]}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          {plays.length === 0 ? "No plays yet." : "No plays match your search."}
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.type}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-extrabold tracking-tight text-foreground">
                {section.label}
              </h2>
              <span className="text-[11px] font-bold text-muted">{section.plays.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {section.plays.map((p) => (
                <PlayCard key={p.id} play={p} canEdit={canEdit} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-surface-raised text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PlayCard({
  play: p,
  canEdit,
}: {
  play: PlaybookDetailPlayRow;
  canEdit: boolean;
}) {
  // Coaches see hidden plays dimmed + toggleable; viewers never receive an
  // unshared row (RLS), so this only ever dims for coaches.
  const hidden = canEdit && !p.shared_with_players;
  const badge = TYPE_BADGE[p.play_type];
  const meta = p.formation_name || p.shorthand || null;

  return (
    <div className="group relative rounded-xl border border-border bg-surface-raised transition-colors hover:border-muted-light">
      <Link
        // Coaches open the editor; viewers open the read-only mobile play
        // viewer (Rule 14) — RLS already limits viewers to shared plays.
        href={canEdit ? `/plays/${p.id}/edit` : `/m/play/${p.id}`}
        className={`relative block rounded-xl p-2 ${hidden ? "opacity-60" : ""}`}
      >
        {/* Opening a play is a dynamic route with a server round-trip; show a
            spinner over the tile the moment it's tapped so it doesn't read as
            unresponsive (and doesn't get double-tapped). */}
        <LinkPendingSpinner overlay />
        <div className="relative">
          {p.preview ? (
            // Same canonical thumbnail the production grid renders — bordered
            // SVG, `thin` for the smaller card.
            <PlayThumbnail preview={p.preview} thin />
          ) : (
            <div className="grid aspect-[16/10] w-full place-items-center rounded-lg border border-border bg-field/90">
              <ListChecks className="size-6 text-white/70" aria-hidden />
            </div>
          )}
          {/* Type glyph, bottom-right over the thumbnail — offense is the
              default so it's left unbadged, matching production. */}
          {p.play_type !== "offense" && (
            <span
              className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
        </div>

        <div className="px-0.5 pt-1.5">
          <div className="truncate text-xs font-bold text-foreground">{p.name}</div>
          {(meta || p.hasNotes || p.tags.length > 0) && (
            <div className="mt-0.5 flex items-center gap-1">
              {meta && <span className="truncate text-[11px] text-muted">{meta}</span>}
              {p.hasNotes && (
                <StickyNote className="size-3 shrink-0 text-muted" aria-label="Has notes" />
              )}
              {p.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="shrink-0 rounded-full border border-border bg-surface-inset px-1.5 py-px text-[10px] font-semibold text-muted"
                >
                  {t}
                </span>
              ))}
              {p.tags.length > 2 && (
                <span className="shrink-0 text-[10px] font-semibold text-muted">
                  +{p.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
      {canEdit && <PlayShareToggle playId={p.id} shared={p.shared_with_players} />}
    </div>
  );
}
