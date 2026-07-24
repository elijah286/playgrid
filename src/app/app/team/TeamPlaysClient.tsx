"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ListChecks, Search, SlidersHorizontal, StickyNote } from "lucide-react";
import type { PlayType } from "@/domain/play/types";
import type { PlaybookDetailPlayRow } from "@/app/actions/plays";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { PlayShareToggle } from "./PlayShareToggle";
import {
  TYPE_LABEL,
  filterPlays,
  sortPlays,
  groupPlays,
  presentPlayTypes,
  type GroupBy,
  type PlayGroup,
  type SortMode,
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
  groups,
  canEdit,
}: {
  plays: PlaybookDetailPlayRow[];
  groups: PlayGroup[];
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<PlayType | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [showArchived, setShowArchived] = useState(false);

  // filter → sort → group, so the chosen sort holds WITHIN each section.
  const presentTypes = useMemo(
    () => presentPlayTypes(plays.filter((p) => showArchived || !p.is_archived)),
    [plays, showArchived],
  );
  const filtered = useMemo(
    () => filterPlays(plays, q, typeFilter, showArchived),
    [plays, q, typeFilter, showArchived],
  );
  const sorted = useMemo(() => sortPlays(filtered, sortMode), [filtered, sortMode]);
  const sections = useMemo(() => groupPlays(sorted, groupBy, groups), [sorted, groupBy, groups]);

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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
          <SortGroupMenu
            sortMode={sortMode}
            onSort={setSortMode}
            groupBy={groupBy}
            onGroup={setGroupBy}
            hasGroups={groups.length > 0}
            showArchived={showArchived}
            onArchived={setShowArchived}
            canEdit={canEdit}
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
          {plays.length === 0 ? "No plays yet." : "No plays match your filters."}
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.key}>
            {section.label && (
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-extrabold tracking-tight text-foreground">
                  {section.label}
                </h2>
                <span className="text-[11px] font-bold text-muted">{section.plays.length}</span>
              </div>
            )}
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

const SORT_OPTS: { value: SortMode; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
];

/** Sort · Group · Show archived — a compact popover, mirroring the production
 *  Filters menu. Type filtering stays on the always-visible chips. */
function SortGroupMenu({
  sortMode,
  onSort,
  groupBy,
  onGroup,
  hasGroups,
  showArchived,
  onArchived,
  canEdit,
}: {
  sortMode: SortMode;
  onSort: (m: SortMode) => void;
  groupBy: GroupBy;
  onGroup: (g: GroupBy) => void;
  hasGroups: boolean;
  showArchived: boolean;
  onArchived: (v: boolean) => void;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groupOpts: { value: GroupBy; label: string }[] = [
    { value: "type", label: "Type" },
    { value: "formation", label: "Formation" },
    ...(hasGroups ? [{ value: "group" as const, label: "Group" }] : []),
    { value: "none", label: "None" },
  ];

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-surface-inset"
      >
        <SlidersHorizontal className="size-4 text-muted" aria-hidden />
        <span className="hidden sm:inline">Sort</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface-raised p-3 shadow-elevated"
        >
          <Segmented
            label="Sort"
            value={sortMode}
            options={SORT_OPTS}
            onChange={(v) => onSort(v as SortMode)}
          />
          <div className="mt-3">
            <Segmented
              label="Group by"
              value={groupBy}
              options={groupOpts}
              onChange={(v) => onGroup(v as GroupBy)}
            />
          </div>
          {canEdit && (
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-sm">
              <span className="font-semibold text-foreground">Show archived</span>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => onArchived(e.target.checked)}
                className="size-4 accent-primary"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1 rounded-lg bg-surface-inset p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
              value === o.value
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {value === o.value && <Check className="size-3" aria-hidden />}
            {o.label}
          </button>
        ))}
      </div>
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
