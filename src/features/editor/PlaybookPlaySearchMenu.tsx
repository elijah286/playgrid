"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { compareNavPlays, formatPlayNavSubtitle } from "@/domain/print/playbookPrint";

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

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  const filteredPlays = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return plays;
    return plays.filter((p) => {
      return (
        p.name.toLowerCase().includes(s) ||
        p.wristband_code.toLowerCase().includes(s) ||
        p.shorthand.toLowerCase().includes(s) ||
        p.formation_name.toLowerCase().includes(s) ||
        p.concept.toLowerCase().includes(s) ||
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
        <div className="absolute right-0 z-30 mt-1 w-[min(100vw-2rem,380px)] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-elevated">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, code, formation, tag…"
                className="pl-9"
                autoFocus
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
          <div className="max-h-[min(60vh,420px)] overflow-y-auto py-1 text-sm">
            {sections.map((sec) => (
              <div key={sec.groupId ?? "ungrouped"} className="border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-2 px-4 py-2">
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
                {sec.plays.map((p) => (
                  <PlayRow
                    key={p.id}
                    p={p}
                    currentPlayId={currentPlayId}
                    printMode={printMode}
                    printSelectedIds={printSelectedIds}
                    onPrintToggle={onPrintToggle}
                    onNavigate={() => setOpen(false)}
                    onNavigatePlay={onNavigatePlay}
                  />
                ))}
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

function PlayRow({
  p,
  currentPlayId,
  printMode,
  printSelectedIds,
  onPrintToggle,
  onNavigate,
  onNavigatePlay,
}: {
  p: PlaybookPlayNavItem;
  currentPlayId: string;
  printMode?: boolean;
  printSelectedIds?: Set<string>;
  onPrintToggle?: (playId: string, next: boolean) => void;
  onNavigate: () => void;
  onNavigatePlay?: (playId: string) => void;
}) {
  const active = p.id === currentPlayId;
  const checked = printMode && printSelectedIds ? printSelectedIds.has(p.id) : true;

  if (printMode && onPrintToggle) {
    return (
      <button
        type="button"
        onClick={() => onPrintToggle(p.id, !checked)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-inset",
          active && "bg-primary/5",
        )}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded border border-border",
            checked && "border-primary bg-primary text-white",
          )}
        >
          {checked ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{p.name}</span>
          <span className="block truncate text-xs text-muted">{formatPlayNavSubtitle(p)}</span>
        </span>
      </button>
    );
  }

  if (onNavigatePlay) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          onNavigatePlay(p.id);
        }}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-inset",
          active && "bg-primary/5",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{p.name}</span>
          <span className="block truncate text-xs text-muted">{formatPlayNavSubtitle(p)}</span>
        </span>
      </button>
    );
  }

  return (
    <Link
      href={`/plays/${p.id}/edit`}
      onClick={onNavigate}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-inset",
        active && "bg-primary/5",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{p.name}</span>
        <span className="block truncate text-xs text-muted">{formatPlayNavSubtitle(p)}</span>
      </span>
    </Link>
  );
}
