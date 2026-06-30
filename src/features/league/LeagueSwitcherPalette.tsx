"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import type { RailLeague } from "./useLeagueNav";

function sportLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Command-palette league switcher — built for scale: instant search across name /
 * city / sport, full keyboard nav (↑↓/↵/esc), sorted by city. Opened from the rail
 * button or ⌘K. Selecting preserves the current section (handled by the caller).
 */
export function LeagueSwitcherPalette({
  open,
  leagues,
  activeId,
  onSelect,
  onClose,
}: {
  open: boolean;
  leagues: RailLeague[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const n = q.trim().toLowerCase();
    const f = n
      ? leagues.filter((l) => `${l.name} ${l.location ?? ""} ${l.sport}`.toLowerCase().includes(n))
      : leagues;
    return [...f].sort(
      (a, b) => (a.location ?? "").localeCompare(b.location ?? "") || a.name.localeCompare(b.name),
    );
  }, [leagues, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setHi(0);
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);
  useEffect(() => setHi(0), [q]);

  if (!open) return null;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[hi];
      if (it) onSelect(it.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leagues by name, city, or sport…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted">esc</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted">No leagues match.</div>
          ) : (
            items.map((l, i) => (
              <button
                key={l.id}
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => onSelect(l.id)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === hi ? "bg-primary/10" : ""}`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-sm ${l.id === activeId ? "font-semibold text-primary" : "text-foreground"}`}>
                    {l.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[l.location, sportLabel(l.sport)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {l.id === activeId ? <span className="shrink-0 text-[11px] text-primary">current</span> : null}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
          ↑↓ navigate · ↵ open · {items.length} league{items.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}
