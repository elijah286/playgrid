"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
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
import { listPlaybookPlaysForNavigationAction } from "@/app/actions/plays";
import type { SavedFormation } from "@/app/actions/formations";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { Button, Input } from "@/components/ui";
import { PlaybookPlaySearchMenu } from "./PlaybookPlaySearchMenu";
import { PlayNumberBadge } from "./PlayNumberBadge";

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

        {playNumber != null && <PlayNumberBadge value={playNumber} />}

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
                <FormationTitlePicker
                  currentId={formationId ?? null}
                  currentName={formation ?? ""}
                  allFormations={allFormations}
                  dispatch={dispatch}
                  onSaveAsNewFormation={onSaveAsNewFormation}
                />
              ) : null}
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-surface-inset"
                title="Rename play"
              >
                <span className="truncate">{name}</span>
                <PencilLine className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </h1>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1">
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


          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={Copy}
            onClick={onDuplicate}
            className="ml-1"
          >
            Copy
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
  const offenseFormations = allFormations.filter((f) => (f.kind ?? "offense") === "offense");

  useEffect(() => {
    if (open) {
      setQuery("");
      queueMicrotask(() => searchRef.current?.focus());
    }
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
            style={{ width: 480 }}
            className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
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
            <div className="max-h-[420px] overflow-y-auto p-2">
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
                        type="button"
                        onClick={() => pick(f)}
                        className={`flex flex-col gap-1.5 rounded-md border p-1.5 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-surface-inset"
                        }`}
                      >
                        <FormationThumbnail formation={f} />
                        <div className="flex items-center gap-1">
                          {selected && <Check className="size-3 shrink-0 text-primary" />}
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

