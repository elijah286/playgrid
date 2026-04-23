"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { compareNavPlays, formatPlayNavSubtitle } from "@/domain/print/playbookPrint";
import { PlayThumbnail } from "./PlayThumbnail";

type Section = {
  title: string | null;
  groupId: string | null;
  plays: PlaybookPlayNavItem[];
};

function buildSections(nav: PlaybookPlayNavItem[], groups: PlaybookGroupRow[]): Section[] {
  const sorted = [...nav].sort(compareNavPlays);
  const sections: Section[] = [];
  const ung = sorted.filter((p) => p.group_id == null);
  if (ung.length > 0) sections.push({ title: null, groupId: null, plays: ung });

  const orderedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);
  for (const g of orderedGroups) {
    const gp = sorted.filter((p) => p.group_id === g.id);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeTileRef = useRef<HTMLElement>(null);
  const [mobileTop, setMobileTop] = useState<number | null>(null);

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
      return;
    }
    function update() {
      if (window.innerWidth >= 640) {
        setMobileTop(null);
        return;
      }
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setMobileTop(r.bottom + 4);
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

  const filteredPlays = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return plays;
    return plays.filter((p) => {
      return (
        p.name.toLowerCase().includes(s) ||
        p.wristband_code.toLowerCase().includes(s) ||
        p.shorthand.toLowerCase().includes(s) ||
        p.formation_name.toLowerCase().includes(s) ||
        p.tags.some((t) => t.toLowerCase().includes(s)) ||
        (p.group_name && p.group_name.toLowerCase().includes(s))
      );
    });
  }, [plays, q]);

  const sections = useMemo(
    () => buildSections(filteredPlays, groups),
    [filteredPlays, groups],
  );

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
          style={mobileTop != null ? { top: mobileTop } : undefined}
          className="fixed inset-x-2 z-30 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-elevated sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-1 sm:w-[min(100vw-2rem,640px)]"
        >
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, code, formation, tag…"
                className="pl-9"
              />
            </div>
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
                <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
                  {sec.plays.map((p) => (
                    <PlayTile
                      key={p.id}
                      p={p}
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
  currentPlayId,
  printMode,
  printSelectedIds,
  onPrintToggle,
  onNavigate,
  onNavigatePlay,
  activeRef,
}: {
  p: PlaybookPlayNavItem;
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
          <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Current
          </span>
        )}
      </div>
      <div className="min-w-0 px-1 pb-1 pt-1.5">
        <span className="block truncate text-xs font-semibold text-foreground">{p.name}</span>
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
