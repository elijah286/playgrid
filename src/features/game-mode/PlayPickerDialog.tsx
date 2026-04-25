"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { PlayNumberBadge } from "./PlayNumberBadge";
import type { GameModePlay } from "./types";

export function PlayPickerDialog({
  open,
  plays,
  currentPlayId,
  onPick,
  onClose,
  canClose,
  inline = false,
  playNumberById,
}: {
  open: boolean;
  plays: GameModePlay[];
  currentPlayId: string | null;
  onPick: (playId: string) => void;
  onClose: () => void;
  /** When false, the close (X) button is hidden — used for the initial
   *  "pick your first play" state where there is no play to fall back to. */
  canClose: boolean;
  /** When true, render as an in-flow panel (no fixed overlay) so the picker
   *  replaces only the next-play row beneath the visible current play. */
  inline?: boolean;
  /** Per-play display number (e.g. "01", "WR-7"). Mirrors the small black
   *  chip shown on printed playsheets so coaches can match what's on the
   *  wristband. */
  playNumberById: Map<string, string>;
}) {
  const [q, setQ] = useState("");
  const currentRef = useRef<HTMLButtonElement | null>(null);

  // Scroll the highlighted current play into view on open so the coach can
  // see at a glance which play was just called, even if it lives far down
  // the list. Only fires while there's no active search filter — searching
  // already re-anchors the scroll to the top of the filtered set.
  useEffect(() => {
    if (!open) return;
    if (q.trim()) return;
    if (!currentPlayId) return;
    const el = currentRef.current;
    if (!el) return;
    // rAF so the DOM has painted the grid before we measure.
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center", behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, q, currentPlayId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return plays;
    return plays.filter((p) => {
      const hay = [
        p.name,
        p.formation_name ?? "",
        p.shorthand ?? "",
        p.concept ?? "",
        playNumberById.get(p.id) ?? "",
        ...(p.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [plays, q, playNumberById]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal={inline ? undefined : "true"}
      aria-label="Pick a play"
      className={
        inline
          ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-inset"
          : "fixed inset-0 z-[60] flex flex-col bg-surface-inset"
      }
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, formation, tag…"
            className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        {canClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-hover"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">
            No plays match &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => {
              const isCurrent = p.id === currentPlayId;
              return (
                <button
                  key={p.id}
                  ref={isCurrent ? currentRef : undefined}
                  type="button"
                  onClick={() => onPick(p.id)}
                  className={
                    "relative flex flex-col gap-2 rounded-xl border-2 p-2 text-left transition-colors active:scale-[0.99] " +
                    (isCurrent
                      ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-surface"
                      : "border-border bg-surface-raised hover:border-primary")
                  }
                >
                  {isCurrent && (
                    <span className="absolute right-2 top-2 z-10 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow">
                      On field
                    </span>
                  )}
                  <div className="text-sm font-semibold text-foreground line-clamp-1">
                    {p.name}
                  </div>
                  {p.formation_name && (
                    <div className="text-[11px] text-muted line-clamp-1">
                      {p.formation_name}
                    </div>
                  )}
                  {p.preview && (
                    <div className="relative overflow-hidden rounded-md">
                      <PlayThumbnail preview={p.preview} thin />
                      {playNumberById.get(p.id) && (
                        <PlayNumberBadge value={playNumberById.get(p.id)!} />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
