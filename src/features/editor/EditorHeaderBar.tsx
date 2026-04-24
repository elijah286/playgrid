"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link2Off,
  PencilLine,
  Plus,
  Search,
} from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import { FormationThumbnail } from "@/app/(dashboard)/playbooks/[playbookId]/PlaybookFormationsTab";
import {
  listPlaybookPlaysForNavigationAction,
  swapPlaySortOrderAction,
} from "@/app/actions/plays";
import type { SavedFormation } from "@/app/actions/formations";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { Button, Input } from "@/components/ui";
import { PlaybookPlaySearchMenu } from "./PlaybookPlaySearchMenu";
import { EditablePlayNumberBadge } from "./PlayNumberBadge";

type Props = {
  playId: string;
  playbookId: string;
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  initialNav: PlaybookPlayNavItem[];
  initialGroups: PlaybookGroupRow[];
  onDuplicate: () => void;
  onNavigateToPlay: (playId: string) => void;
  onSaveAsNewFormation: (name: string) => void | Promise<void>;
  allFormations?: SavedFormation[];
  canEdit?: boolean;
  /** When false, the formation picker is read-only on mobile. Desktop is
   *  unaffected. Driven by the admin site toggle for mobile editing. */
  mobileEditingEnabled?: boolean;
  /** When true, the sibling-play navigation (Previous/All plays/Next) and
   *  the Copy button are hidden on small screens so the limited mobile
   *  width goes to the edit toolbar instead. Desktop always shows them. */
  hideMobileNav?: boolean;
};

export function EditorHeaderBar({
  playId,
  playbookId,
  doc,
  dispatch,
  initialNav,
  initialGroups,
  onDuplicate,
  onNavigateToPlay,
  onSaveAsNewFormation,
  allFormations = [],
  canEdit = true,
  mobileEditingEnabled = false,
  hideMobileNav = false,
}: Props) {
  const [nav, setNav] = useState(initialNav);
  const [groups, setGroups] = useState(initialGroups);
  const [editingName, setEditingName] = useState(false);
  const [, startTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNav(initialNav);
    setGroups(initialGroups);
  }, [initialNav, initialGroups]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  const ix = useMemo(() => nav.findIndex((p) => p.id === playId), [nav, playId]);
  const prevPlay = ix > 0 ? nav[ix - 1] : null;
  const nextPlay = ix >= 0 && ix < nav.length - 1 ? nav[ix + 1] : null;

  const name = doc.metadata.coachName || "Untitled play";
  const formation = doc.metadata.formation?.trim();
  const formationId = doc.metadata.formationId;
  const playNumber = ix >= 0 ? ix + 1 : null;

  // Refresh the sibling nav when this play is renamed (server-side ordering may
  // change). Cheap best-effort; ignore result if it fails.
  useEffect(() => {
    startTransition(async () => {
      const res = await listPlaybookPlaysForNavigationAction(playbookId);
      if (res.ok) {
        setNav(res.plays);
        setGroups(res.groups);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playId]);

  return (
    <header className="flex flex-col border-b border-border pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/playbooks/${playbookId}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted ring-1 ring-border hover:bg-surface-inset hover:text-foreground"
          aria-label="Back to playbook"
        >
          <ArrowLeft className="size-3.5" />
          Playbook
        </Link>

        {playNumber != null && (
          <EditablePlayNumberBadge
            value={playNumber}
            max={nav.length}
            disabled={!canEdit}
            onChange={(target) => {
              const targetPlay = nav[target - 1];
              if (!targetPlay || targetPlay.id === playId) return;
              startTransition(async () => {
                const res = await swapPlaySortOrderAction(
                  playbookId,
                  playId,
                  targetPlay.id,
                );
                if (!res.ok) return;
                const refreshed = await listPlaybookPlaysForNavigationAction(playbookId);
                if (refreshed.ok) {
                  setNav(refreshed.plays);
                  setGroups(refreshed.groups);
                }
              });
            }}
          />
        )}

        {editingName ? (
          <Input
            ref={nameInputRef}
            value={doc.metadata.coachName}
            onChange={(e) =>
              dispatch({ type: "document.setMetadata", patch: { coachName: e.target.value } })
            }
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
            }}
            className="h-8 min-w-[200px] flex-1 text-base font-bold"
            aria-label="Play name"
          />
        ) : (
          <div className="inline-flex min-w-0 items-center gap-1">
            <h1 className="flex min-w-0 items-center text-base font-bold text-foreground">
              {(doc.metadata.playType ?? "offense") === "offense" ? (
                canEdit ? (
                  <>
                    {!mobileEditingEnabled && (
                      <span className="inline-flex items-center px-1 py-0.5 text-muted sm:hidden">
                        <span>{formation || "No formation"}</span>
                        <span className="mx-1">·</span>
                      </span>
                    )}
                    <span
                      className={
                        mobileEditingEnabled
                          ? "inline-flex"
                          : "hidden sm:inline-flex"
                      }
                    >
                      <FormationTitlePicker
                        currentId={formationId ?? null}
                        currentName={formation ?? ""}
                        allFormations={allFormations}
                        dispatch={dispatch}
                        onSaveAsNewFormation={onSaveAsNewFormation}
                      />
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center px-1 py-0.5 text-muted">
                    <span>{formation || "No formation"}</span>
                    <span className="mx-1">·</span>
                  </span>
                )
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="group inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-surface-inset"
                  title="Rename play"
                >
                  <span className="truncate">{name}</span>
                  <PencilLine className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ) : (
                <span className="inline-flex min-w-0 items-center px-1 py-0.5">
                  <span className="truncate">{name}</span>
                </span>
              )}
            </h1>
          </div>
        )}

        {/* Copy stays pinned next to the play name so it never wraps to
            its own row on mobile. Prev/All/Next live in a sibling cluster
            that can wrap below on narrow viewports. */}
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={Copy}
            onClick={onDuplicate}
            className={`ml-auto ${hideMobileNav ? "hidden sm:inline-flex" : ""}`}
          >
            Copy
          </Button>
        )}
        <div
          className={`${
            hideMobileNav ? "hidden sm:flex" : "flex"
          } w-full flex-wrap items-center gap-1 sm:ml-0 sm:w-auto`}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={ChevronLeft}
            disabled={!prevPlay}
            onClick={() => prevPlay && onNavigateToPlay(prevPlay.id)}
          >
            Previous play
          </Button>
          <PlaybookPlaySearchMenu
            plays={nav}
            groups={groups}
            currentPlayId={playId}
            onNavigatePlay={onNavigateToPlay}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            rightIcon={ChevronRight}
            disabled={!nextPlay}
            onClick={() => nextPlay && onNavigateToPlay(nextPlay.id)}
          >
            Next play
          </Button>
        </div>
      </div>
    </header>
  );
}

function FormationTitlePicker({
  currentId,
  currentName,
  allFormations,
  dispatch,
  onSaveAsNewFormation,
}: {
  currentId: string | null;
  currentName: string;
  allFormations: SavedFormation[];
  dispatch: (c: PlayCommand) => void;
  onSaveAsNewFormation: (name: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const activeFormationRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const offenseFormations = allFormations.filter((f) => (f.kind ?? "offense") === "offense");

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
    if (open) {
      setQuery("");
      if (typeof window !== "undefined" && window.innerWidth >= 640) {
        queueMicrotask(() => searchRef.current?.focus());
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    function run() {
      const t = activeFormationRef.current;
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

  const q = query.trim().toLowerCase();
  const filtered = q
    ? offenseFormations.filter((f) => f.displayName.toLowerCase().includes(q))
    : offenseFormations;

  function pick(f: SavedFormation | null) {
    if (!f) {
      dispatch({ type: "document.setFormationLink", formationId: null, formationName: "" });
    } else {
      dispatch({
        type: "document.setFormationLink",
        formationId: f.id,
        formationName: f.displayName,
        players: f.players,
        formationLosY: f.losY,
      });
    }
    setOpen(false);
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-muted hover:bg-surface-inset hover:text-foreground"
        title="Change or unlink formation"
      >
        <span>{currentName || "No formation"}</span>
        <ChevronDown className="size-3.5" />
      </button>
      <span className="mx-1 text-muted">·</span>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={mobileTop != null ? { top: mobileTop } : undefined}
            className="fixed inset-x-2 z-50 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-[480px]"
          >
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter" && filtered.length > 0) pick(filtered[0]);
                }}
                placeholder="Search formations…"
                className="w-full rounded-md border border-border bg-surface-inset py-1.5 pl-7 pr-2 text-xs font-normal text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Name for the new formation");
                if (!name || !name.trim()) return;
                setOpen(false);
                void onSaveAsNewFormation(name.trim());
              }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs font-medium text-primary hover:bg-primary/5"
            >
              <Plus className="size-3.5" />
              Save current layout as new formation
            </button>
            {currentId && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs font-medium text-danger hover:bg-danger/5"
              >
                <Link2Off className="size-3.5" />
                Unlink formation
              </button>
            )}
            <div
              data-formation-scroll
              className="max-h-[min(70vh,720px)] overflow-y-auto p-2"
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted">
                  {q ? "No matches." : "No saved formations"}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filtered.map((f) => {
                    const selected = f.id === currentId;
                    return (
                      <button
                        key={f.id}
                        ref={selected ? activeFormationRef : undefined}
                        type="button"
                        onClick={() => pick(f)}
                        className={`flex flex-col gap-1.5 rounded-md border p-1.5 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-surface-inset"
                        }`}
                      >
                        <div className="relative">
                          <FormationThumbnail formation={f} />
                          {selected && (
                            <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="truncate text-xs font-medium text-foreground">
                            {f.displayName}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

