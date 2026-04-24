"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, SegmentedControl } from "@/components/ui";
import type { SavedFormation } from "@/app/actions/formations";
import { FormationThumbnail } from "@/app/(dashboard)/playbooks/[playbookId]/PlaybookFormationsTab";

type ViewMode = "grid" | "list";

export function PlaybookFormationSearchMenu({
  formations,
  currentFormationId,
  onNavigate,
  triggerClassName,
}: {
  formations: SavedFormation[];
  currentFormationId: string;
  onNavigate: (formationId: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
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
      const scroller = t.closest("[data-formation-scroll]") as HTMLElement | null;
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

  const filtered = useMemo(() => {
    const sorted = [...formations].sort((a, b) => a.sortOrder - b.sortOrder);
    const s = q.trim().toLowerCase();
    if (!s) return sorted;
    return sorted.filter((f) => f.displayName.toLowerCase().includes(s));
  }, [formations, q]);

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
        All formations
      </Button>
      {open && (
        <div
          ref={panelRef}
          style={mobileTop != null ? { top: mobileTop } : undefined}
          className="fixed inset-x-2 z-30 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-elevated sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-1 sm:w-[min(100vw-2rem,560px)]"
        >
          <div className="flex items-center gap-2 border-b border-border p-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search formations…"
                className="pl-9"
              />
            </div>
            <SegmentedControl
              size="sm"
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { value: "grid", label: "Grid", icon: LayoutGrid },
                { value: "list", label: "List", icon: List },
              ]}
            />
          </div>
          <div
            data-formation-scroll
            className="max-h-[min(80vh,720px)] overflow-y-auto p-3 text-sm"
          >
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">No formations match.</p>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filtered.map((f) => (
                  <FormationTile
                    key={f.id}
                    formation={f}
                    active={f.id === currentFormationId}
                    onSelect={() => {
                      setOpen(false);
                      onNavigate(f.id);
                    }}
                    activeRef={f.id === currentFormationId ? activeTileRef : undefined}
                  />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {filtered.map((f) => (
                  <FormationRow
                    key={f.id}
                    formation={f}
                    active={f.id === currentFormationId}
                    onSelect={() => {
                      setOpen(false);
                      onNavigate(f.id);
                    }}
                    activeRef={f.id === currentFormationId ? activeTileRef : undefined}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormationTile({
  formation,
  active,
  onSelect,
  activeRef,
}: {
  formation: SavedFormation;
  active: boolean;
  onSelect: () => void;
  activeRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <button
      ref={activeRef as React.RefObject<HTMLButtonElement> | undefined}
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border p-1 text-left transition-colors hover:border-primary/50 hover:bg-surface-inset",
        active ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className="relative">
        <FormationThumbnail formation={formation} />
        {active && (
          <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Current
          </span>
        )}
      </div>
      <div className="min-w-0 px-1 pb-1 pt-1.5">
        <span className="block truncate text-xs font-semibold text-foreground">
          {formation.displayName}
        </span>
        <span className="block truncate text-[10px] text-muted">
          {formation.players.length} players
        </span>
      </div>
    </button>
  );
}

function FormationRow({
  formation,
  active,
  onSelect,
  activeRef,
}: {
  formation: SavedFormation;
  active: boolean;
  onSelect: () => void;
  activeRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <li>
      <button
        ref={activeRef as React.RefObject<HTMLButtonElement> | undefined}
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-inset",
          active && "bg-primary/5",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {formation.displayName}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {formation.players.length} players
        </span>
        {active && (
          <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Current
          </span>
        )}
      </button>
    </li>
  );
}
