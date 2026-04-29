"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, SegmentedControl } from "@/components/ui";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { formatPlayNavSubtitle } from "@/domain/print/playbookPrint";
import { PlayThumbnail } from "./PlayThumbnail";

type Section = {
  title: string | null;
  groupId: string | null;
  plays: PlaybookPlayNavItem[];
};

function buildSections(nav: PlaybookPlayNavItem[], groups: PlaybookGroupRow[]): Section[] {
  // Preserve the parent's nav order — that order IS the play-number sequence
  // (it's what the editor's playNumber badge counts against). Re-sorting
  // here let compareNavPlays' name fallback scramble plays that share a
  // sort_order, so users saw the dropdown in alphabetical order instead of
  // play-number order. Just split by group while keeping relative position.
  const sections: Section[] = [];
  const ung = nav.filter((p) => p.group_id == null);
  if (ung.length > 0) sections.push({ title: null, groupId: null, plays: ung });

  const orderedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);
  for (const g of orderedGroups) {
    const gp = nav.filter((p) => p.group_id === g.id);
    if (gp.length > 0) sections.push({ title: g.name, groupId: g.id, plays: gp });
  }
  return sections;
}

type Props = {
  plays: PlaybookPlayNavItem[];
  groups: PlaybookGroupRow[];
  currentPlayId: string;
  printMode?: boolean;
  printSelectedIds?: Set<string>;
  onPrintToggle?: (playId: string, next: boolean) => void;
  onToggleGroup?: (groupId: string | null, next: boolean) => void;
  triggerClassName?: string;
  onNavigatePlay?: (playId: string) => void;
};

export function PlaybookPlaySearchMenu({
  plays,
  groups,
  currentPlayId,
  printMode,
  printSelectedIds,
  onPrintToggle,
  onToggleGroup,
  triggerClassName,
  onNavigatePlay,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<"all" | "offense" | "defense" | "special_teams">("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeTileRef = useRef<HTMLElement>(null);
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const [desktopPos, setDesktopPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMobileTop(null);
      setDesktopPos(null);
      return;
    }
    function update() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      if (window.innerWidth < 640) {
        setMobileTop(r.bottom + 4);
        setDesktopPos(null);
        return;
      }
      // Desktop: left-align to trigger, clamp so the panel stays on screen.
      const margin = 8;
      const maxWidth = Math.min(640, window.innerWidth - margin * 2);
      const left = Math.max(
        margin,
        Math.min(r.left, window.innerWidth - maxWidth - margin),
      );
      setMobileTop(null);
      setDesktopPos({ left, top: r.bottom + 4, width: maxWidth });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    function run() {
      const t = activeTileRef.current;
      if (!t || cancelled) return;
      const scroller = t.closest("[data-play-scroll]") as HTMLElement | null;
      if (!scroller) return;
      const sr = scroller.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const offset = tr.top - sr.top - (sr.height - tr.height) / 2;
      scroller.scrollTop += offset;
    }
    const r1 = requestAnimationFrame(run);
    const t1 = window.setTimeout(run, 150);
    const t2 = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open]);

  // Only show the type selector if the playbook actually contains more than
  // one play type — otherwise it's dead UI.
  const availableTypes = useMemo(() => {
    const s = new Set<"offense" | "defense" | "special_teams">();
    for (const p of plays) s.add(p.play_type);
    return s;
  }, [plays]);
  const showTypeFilter = availableTypes.size > 1;
  const typeOptions = useMemo(() => {
    const opts: { value: "all" | "offense" | "defense" | "special_teams"; label: string }[] = [
      { value: "all", label: "All" },
    ];
    if (availableTypes.has("offense")) opts.push({ value: "offense", label: "Offense" });
    if (availableTypes.has("defense")) opts.push({ value: "defense", label: "Defense" });
    if (availableTypes.has("special_teams")) opts.push({ value: "special_teams", label: "ST" });
    return opts;
  }, [availableTypes]);

  // If the stored filter is no longer available (playbook changed), treat it
  // as "all" for this render rather than eagerly writing state from an effect.
  const effectiveTypeFilter: typeof typeFilter =
    typeFilter !== "all" && !availableTypes.has(typeFilter) ? "all" : typeFilter;

  const filteredPlays = useMemo(() => {
    const s = q.trim().toLowerCase();
    const byType =
      effectiveTypeFilter === "all"
        ? plays
        : plays.filter((p) => p.play_type === effectiveTypeFilter);
    if (!s) return byType;
    return byType.filter((p) => {
      return (
        p.name.toLowerCase().includes(s) ||
        p.wristband_code.toLowerCase().includes(s) ||
        p.shorthand.toLowerCase().includes(s) ||
        p.formation_name.toLowerCase().includes(s) ||
        p.tags.some((t) => t.toLowerCase().includes(s)) ||
        (p.group_name && p.group_name.toLowerCase().includes(s))
      );
    });
  }, [plays, q, effectiveTypeFilter]);

  const sections = useMemo(
    () => buildSections(filteredPlays, groups),
    [filteredPlays, groups],
  );

  // Map each play to its 1-based play number (its position in the unfiltered
  // nav). Stays stable when the user types a search query so the badge keeps
  // showing the play's "true" number, not a rank within filtered results.
  const playNumberById = useMemo(() => {
    const m = new Map<string, number>();
    plays.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [plays]);

  const allFilteredSelected =
    printMode &&
    printSelectedIds &&
    filteredPlays.length > 0 &&
    filteredPlays.every((p) => printSelectedIds.has(p.id));

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="sm"
        rightIcon={ChevronDown}
        className={cn("max-w-[220px] truncate", triggerClassName)}
        onClick={() => setOpen((v) => !v)}
      >
        {printMode ? "Plays in print" : "All plays"}
      </Button>
      {open && (
        <div
          ref={panelRef}
          style={
            mobileTop != null
              ? { top: mobileTop }
              : desktopPos
                ? { left: desktopPos.left, top: desktopPos.top, width: desktopPos.width }
                : undefined
          }
          className="fixed inset-x-2 z-30 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-elevated sm:inset-x-auto"
        >
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, code, formation, tag…"
                  className="pl-9"
                />
              </div>
              <SegmentedControl
                size="sm"
                value={viewMode}
                onChange={(v) => setViewMode(v as "grid" | "list")}
                options={[
                  { value: "grid", label: "Grid", icon: LayoutGrid },
                  { value: "list", label: "List", icon: List },
                ]}
              />
            </div>
            {showTypeFilter && (
              <div className="mt-2">
                <SegmentedControl
                  size="sm"
                  value={effectiveTypeFilter}
                  onChange={(v) => setTypeFilter(v as typeof typeFilter)}
                  options={typeOptions}
                />
              </div>
            )}
            {printMode && onPrintToggle && onToggleGroup && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    for (const p of plays) onPrintToggle(p.id, true);
                  }}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    for (const p of plays) onPrintToggle(p.id, false);
                  }}
                >
                  Clear all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const on = !allFilteredSelected;
                    for (const p of filteredPlays) onPrintToggle(p.id, on);
                  }}
                >
                  {allFilteredSelected ? "Deselect filtered" : "Select filtered"}
                </Button>
              </div>
            )}
          </div>
          <div
            data-play-scroll
            className="max-h-[min(80vh,820px)] overflow-y-auto py-1 text-sm"
          >
            {sections.map((sec) => (
              <div key={sec.groupId ?? "ungrouped"} className="border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {sec.title ?? "Ungrouped"}
                  </span>
                  {printMode && onToggleGroup && printSelectedIds && sec.plays.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        const anyOn = sec.plays.some((p) => printSelectedIds.has(p.id));
                        onToggleGroup(sec.groupId, !anyOn);
                      }}
                    >
                      Toggle group
                    </Button>
                  )}
                </div>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
                    {sec.plays.map((p) => (
                      <PlayTile
                        key={p.id}
                        p={p}
                        playNumber={playNumberById.get(p.id) ?? null}
                        currentPlayId={currentPlayId}
                        printMode={printMode}
                        printSelectedIds={printSelectedIds}
                        onPrintToggle={onPrintToggle}
                        onNavigate={() => setOpen(false)}
                        onNavigatePlay={onNavigatePlay}
                        activeRef={p.id === currentPlayId ? activeTileRef : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <ul className="mx-3 mb-3 divide-y divide-border overflow-hidden rounded-md border border-border">
                    {sec.plays.map((p) => (
                      <PlayRow
                        key={p.id}
                        p={p}
                        playNumber={playNumberById.get(p.id) ?? null}
                        currentPlayId={currentPlayId}
                        printMode={printMode}
                        printSelectedIds={printSelectedIds}
                        onPrintToggle={onPrintToggle}
                        onNavigate={() => setOpen(false)}
                        onNavigatePlay={onNavigatePlay}
                        activeRef={p.id === currentPlayId ? activeTileRef : undefined}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {sections.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted">No plays match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayTile({
  p,
  playNumber,
  currentPlayId,
  printMode,
  printSelectedIds,
  onPrintToggle,
  onNavigate,
  onNavigatePlay,
  activeRef,
}: {
  p: PlaybookPlayNavItem;
  playNumber: number | null;
  currentPlayId: string;
  printMode?: boolean;
  printSelectedIds?: Set<string>;
  onPrintToggle?: (playId: string, next: boolean) => void;
  onNavigate: () => void;
  onNavigatePlay?: (playId: string) => void;
  activeRef?: React.RefObject<HTMLElement | null>;
}) {
  const active = p.id === currentPlayId;
  const checked = printMode && printSelectedIds ? printSelectedIds.has(p.id) : true;

  const tileInner = (
    <>
      <div className="relative">
        {p.preview ? (
          <PlayThumbnail preview={p.preview} />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-border bg-surface-inset text-[10px] text-muted">
            no preview
          </div>
        )}
        {printMode && (
          <span
            className={cn(
              "absolute right-1 top-1 flex size-5 items-center justify-center rounded border border-border bg-surface-raised",
              checked && "border-primary bg-primary text-white",
            )}
          >
            {checked ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        )}
        {active && (
          <span className="absolute right-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Current
          </span>
        )}
      </div>
      <div className="min-w-0 px-1 pb-1 pt-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
          {playNumber != null && (
            <span className="shrink-0 rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
              {String(playNumber).padStart(2, "0")}
            </span>
          )}
          <span className="truncate">{p.name}</span>
        </span>
        <span className="block truncate text-[10px] text-muted">{formatPlayNavSubtitle(p)}</span>
      </div>
    </>
  );

  const tileCls = cn(
    "flex flex-col overflow-hidden rounded-md border p-1 text-left transition-colors hover:border-primary/50 hover:bg-surface-inset",
    active ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
  );

  if (printMode && onPrintToggle) {
    return (
      <button
        ref={activeRef as React.RefObject<HTMLButtonElement> | undefined}
        type="button"
        onClick={() => onPrintToggle(p.id, !checked)}
        className={tileCls}
      >
        {tileInner}
      </button>
    );
  }

  if (onNavigatePlay) {
    return (
      <button
        ref={activeRef as React.RefObject<HTMLButtonElement> | undefined}
        type="button"
        onClick={() => {
          onNavigate();
          onNavigatePlay(p.id);
        }}
        className={tileCls}
      >
        {tileInner}
      </button>
    );
  }

  return (
    <Link
      ref={activeRef as React.RefObject<HTMLAnchorElement> | undefined}
      href={`/plays/${p.id}/edit`}
      onClick={onNavigate}
      className={tileCls}
    >
      {tileInner}
    </Link>
  );
}

function PlayRow({
  p,
  playNumber,
  currentPlayId,
  printMode,
  printSelectedIds,
  onPrintToggle,
  onNavigate,
  onNavigatePlay,
  activeRef,
}: {
  p: PlaybookPlayNavItem;
  playNumber: number | null;
  currentPlayId: string;
  printMode?: boolean;
  printSelectedIds?: Set<string>;
  onPrintToggle?: (playId: string, next: boolean) => void;
  onNavigate: () => void;
  onNavigatePlay?: (playId: string) => void;
  activeRef?: React.RefObject<HTMLElement | null>;
}) {
  const active = p.id === currentPlayId;
  const checked = printMode && printSelectedIds ? printSelectedIds.has(p.id) : true;

  const rowInner = (
    <>
      {printMode && (
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded border border-border bg-surface-raised",
            checked && "border-primary bg-primary text-white",
          )}
        >
          {checked ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
      )}
      {playNumber != null && (
        <span className="shrink-0 rounded bg-surface-inset px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
          {String(playNumber).padStart(2, "0")}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
        <span className="block truncate text-[11px] text-muted">
          {formatPlayNavSubtitle(p)}
        </span>
      </div>
      {active && (
        <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          Current
        </span>
      )}
    </>
  );

  const rowCls = cn(
    "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-inset",
    active && "bg-primary/5",
  );

  if (printMode && onPrintToggle) {
    return (
      <li>
        <button
          ref={activeRef as React.RefObject<HTMLButtonElement> | undefined}
          type="button"
          onClick={() => onPrintToggle(p.id, !checked)}
          className={rowCls}
        >
          {rowInner}
        </button>
      </li>
    );
  }

  if (onNavigatePlay) {
    return (
      <li>
        <button
          ref={activeRef as React.RefObject<HTMLButtonElement> | undefined}
          type="button"
          onClick={() => {
            onNavigate();
            onNavigatePlay(p.id);
          }}
          className={rowCls}
        >
          {rowInner}
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        ref={activeRef as React.RefObject<HTMLAnchorElement> | undefined}
        href={`/plays/${p.id}/edit`}
        onClick={onNavigate}
        className={rowCls}
      >
        {rowInner}
      </Link>
    </li>
  );
}
