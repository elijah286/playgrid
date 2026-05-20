"use client";

import { Check, X } from "lucide-react";

/**
 * Sticky bulk-action bar shown when the calendar list is in select mode.
 * Mirrors the inbox `BulkActionBar` shape so the multi-select muscle memory
 * is the same across surfaces. RSVP-only — selecting events on the calendar
 * can't archive/delete (those are inbox affordances).
 */
export function BulkRsvpBar({
  selectedCount,
  selectableCount,
  busy,
  onSelectAll,
  onClear,
  onRsvp,
  onExit,
}: {
  selectedCount: number;
  /** How many cards in the visible list can be selected (excludes past). */
  selectableCount: number;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onRsvp: (status: "yes" | "maybe" | "no") => void;
  onExit: () => void;
}) {
  const noneSelected = selectedCount === 0;
  const allSelected = selectedCount > 0 && selectedCount === selectableCount;
  return (
    <div
      className="sticky bottom-2 z-20 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 shadow-md backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      role="region"
      aria-label="Bulk RSVP actions"
    >
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="font-medium text-primary hover:underline"
        >
          {allSelected ? "Clear" : `Select all (${selectableCount})`}
        </button>
        <span className="text-muted">
          {noneSelected
            ? "Pick events to RSVP."
            : `${selectedCount} selected`}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={busy || noneSelected}
          onClick={() => onRsvp("yes")}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="size-3.5" />
          Going
        </button>
        <button
          type="button"
          disabled={busy || noneSelected}
          onClick={() => onRsvp("maybe")}
          className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Maybe
        </button>
        <button
          type="button"
          disabled={busy || noneSelected}
          onClick={() => onRsvp("no")}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-3.5" />
          Can&apos;t go
        </button>
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" aria-hidden />
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-inset hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}
