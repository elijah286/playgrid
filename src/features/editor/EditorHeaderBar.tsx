"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import { listPlaybookPlaysForNavigationAction } from "@/app/actions/plays";
import type { SavedFormation } from "@/app/actions/formations";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { Badge, Button, Input } from "@/components/ui";
import { PlaybookPlaySearchMenu } from "./PlaybookPlaySearchMenu";
import { FORMATION_TAG_PRESETS } from "./Inspector";

const DRIFT_THRESHOLD_YDS = 2;
const FORM_FIELD_LEN = 25;

function useDebouncedDoc(doc: PlayDocument, delay = 200): PlayDocument {
  const [debounced, setDebounced] = useState(doc);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(doc), delay);
    return () => clearTimeout(t);
  }, [doc, delay]);
  return debounced;
}

function computeDrift(doc: PlayDocument, linked: SavedFormation | null): boolean {
  const formationId = doc.metadata.formationId;
  if (!formationId || !linked) return false;
  const formLosY = linked.losY ?? 0.4;
  const playLosY = typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
  const playFieldLen = doc.sportProfile.fieldLengthYds;
  const playFieldW = doc.sportProfile.fieldWidthYds;
  const fpMap = new Map(linked.players.map((p) => [p.id, p.position]));
  return doc.layers.players.some((p) => {
    const fp = fpMap.get(p.id);
    if (!fp) return false;
    const playYds = (p.position.y - playLosY) * playFieldLen;
    const formYds = (fp.y - formLosY) * FORM_FIELD_LEN;
    const dyYds = playYds - formYds;
    const dxYds = (p.position.x - fp.x) * playFieldW;
    return Math.hypot(dxYds, dyYds) > DRIFT_THRESHOLD_YDS;
  });
}

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
  linkedFormation?: SavedFormation | null;
  opponentFormation?: SavedFormation | null;
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
  linkedFormation,
  opponentFormation,
  allFormations = [],
}: Props) {
  const router = useRouter();
  const [nav, setNav] = useState(initialNav);
  const [groups, setGroups] = useState(initialGroups);
  const [editingName, setEditingName] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
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

  const tags = doc.metadata.tags;
  const name = doc.metadata.coachName || "Untitled play";
  const formation = doc.metadata.formation?.trim();
  const code = doc.metadata.wristbandCode?.trim();
  const formationTag = doc.metadata.formationTag ?? null;
  const debouncedDoc = useDebouncedDoc(doc);
  const hasDrift = computeDrift(debouncedDoc, linkedFormation ?? null);
  const formationId = doc.metadata.formationId;

  // Gate the drift prompt so it doesn't flash right after picking a formation:
  // require drift to persist for a beat, and reset immediately on formation change.
  const [stableDrift, setStableDrift] = useState(false);
  useEffect(() => {
    if (!hasDrift) {
      setStableDrift(false);
      return;
    }
    const t = setTimeout(() => setStableDrift(true), 500);
    return () => clearTimeout(t);
  }, [hasDrift]);
  useEffect(() => {
    setStableDrift(false);
  }, [formationId]);
  const showDriftPrompt = stableDrift && !formationTag;

  function reapplyFormation() {
    if (!linkedFormation) return;
    dispatch({
      type: "document.reapplyFormation",
      players: linkedFormation.players,
      formationLosY: linkedFormation.losY,
    });
  }
  function unlinkFormation() {
    dispatch({ type: "document.setFormationLink", formationId: null, formationName: "" });
  }

  function setFormationTag(tag: string) {
    dispatch({ type: "document.setFormationTag", formationTag: tag || null });
  }

  function clearFormationTag() {
    dispatch({ type: "document.setFormationTag", formationTag: null });
  }

  function addTag(raw: string) {
    const cleaned = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (cleaned.length === 0) return;
    const next = Array.from(new Set([...tags, ...cleaned]));
    dispatch({ type: "document.setMetadata", patch: { tags: next } });
    setTagDraft("");
  }

  function removeTag(t: string) {
    dispatch({
      type: "document.setMetadata",
      patch: { tags: tags.filter((x) => x !== t) },
    });
  }

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
    <header className="flex flex-col gap-2 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/playbooks/${playbookId}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted ring-1 ring-border hover:bg-surface-inset hover:text-foreground"
          aria-label="Back to playbook"
        >
          <ArrowLeft className="size-3.5" />
          Playbook
        </Link>

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
            {code ? (
              <span className="text-xs font-semibold text-muted">#{code}</span>
            ) : null}
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

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg px-3 py-2">
        {tags.map((t) => (
          <Badge key={t} variant="default" className="inline-flex items-center gap-1">
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="rounded hover:text-danger"
              aria-label={`Remove tag ${t}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {formationTag && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {formationTag}
            <button
              type="button"
              onClick={clearFormationTag}
              className="rounded hover:text-primary/60"
              aria-label="Remove variation tag"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        <Input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagDraft);
            }
          }}
          placeholder={tags.length === 0 ? "Add tag (press Enter)…" : "Add tag…"}
          className="h-7 w-[160px] text-xs"
        />

        {formationId && (
          <div className="ml-auto flex items-center gap-1">
            {linkedFormation && (
              <button
                type="button"
                title="Reapply formation (snap players back)"
                onClick={reapplyFormation}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-inset hover:text-foreground"
              >
                <RefreshCcw className="size-3" />
                Reapply
              </button>
            )}
            <button
              type="button"
              title="Unlink formation"
              onClick={unlinkFormation}
              className="flex size-6 items-center justify-center rounded text-muted hover:text-foreground"
              aria-label="Unlink formation"
            >
              <Link2Off className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {formationId && (
        <div
          aria-live="polite"
          className={`flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg px-3 ${
            showDriftPrompt ? "bg-warning/10 ring-1 ring-warning/25" : ""
          }`}
        >
          {showDriftPrompt && (
            <>
              <span className="text-[11px] font-semibold text-warning">
                Formation drifted —
              </span>
              <span className="text-[11px] text-muted">tag this variation:</span>
              {FORMATION_TAG_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFormationTag(preset)}
                  className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                >
                  {preset}
                </button>
              ))}
            </>
          )}
        </div>
      )}
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
          <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg">
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
            <ul className="max-h-64 overflow-y-auto py-1 text-sm font-normal">
              {filtered.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => pick(f)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-inset ${
                      f.id === currentId ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {f.id === currentId ? (
                      <Check className="size-3 shrink-0 text-primary" />
                    ) : (
                      <span className="size-3 shrink-0" />
                    )}
                    <span className="truncate">{f.displayName}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-center text-xs text-muted">
                  {q ? "No matches." : "No saved formations"}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </span>
  );
}

