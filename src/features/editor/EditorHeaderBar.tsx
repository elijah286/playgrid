"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link2Off,
  Loader2,
  PencilLine,
  Redo2,
  RefreshCcw,
  Undo2,
  X,
} from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import { listPlaybookPlaysForNavigationAction } from "@/app/actions/plays";
import type { SavedFormation } from "@/app/actions/formations";
import type { PlaybookGroupRow, PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { Badge, IconButton, Input, Kbd } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
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

type SaveStatus = "idle" | "saving" | "saved";

type Props = {
  playId: string;
  playbookId: string;
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  initialNav: PlaybookPlayNavItem[];
  initialGroups: PlaybookGroupRow[];
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  linkedFormation?: SavedFormation | null;
};

export function EditorHeaderBar({
  playId,
  playbookId,
  doc,
  dispatch,
  initialNav,
  initialGroups,
  onDuplicate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saveStatus,
  linkedFormation,
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
  const showDriftPrompt = hasDrift && !formationTag;
  const formationId = doc.metadata.formationId;

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
        <Link href={`/playbooks/${playbookId}`}>
          <IconButton icon={ArrowLeft} tooltip="Back to playbook" size="sm" />
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
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="group inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-surface-inset"
            title="Rename play"
          >
            <h1 className="truncate text-base font-bold text-foreground">
              {formation ? (
                <>
                  <span className="text-muted">{formation} · </span>
                  {name}
                </>
              ) : (
                name
              )}
            </h1>
            {code ? (
              <span className="text-xs font-semibold text-muted">#{code}</span>
            ) : null}
            <PencilLine className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Tooltip content="Previous play">
            <IconButton
              icon={ChevronLeft}
              variant="ghost"
              size="sm"
              aria-label="Previous play"
              disabled={!prevPlay}
              onClick={() => prevPlay && router.push(`/plays/${prevPlay.id}/edit`)}
            />
          </Tooltip>
          <Tooltip content="Next play">
            <IconButton
              icon={ChevronRight}
              variant="ghost"
              size="sm"
              aria-label="Next play"
              disabled={!nextPlay}
              onClick={() => nextPlay && router.push(`/plays/${nextPlay.id}/edit`)}
            />
          </Tooltip>
          <Tooltip content="Duplicate play">
            <IconButton icon={Copy} variant="ghost" size="sm" onClick={onDuplicate} />
          </Tooltip>

          <PlaybookPlaySearchMenu plays={nav} groups={groups} currentPlayId={playId} />

          <div className="mx-1 h-5 w-px bg-border" />

          <Tooltip content={<span className="flex items-center gap-2">Undo <Kbd keys="Ctrl+Z" /></span>}>
            <IconButton icon={Undo2} variant="ghost" size="sm" disabled={!canUndo} onClick={onUndo} />
          </Tooltip>
          <Tooltip content={<span className="flex items-center gap-2">Redo <Kbd keys="Ctrl+Shift+Z" /></span>}>
            <IconButton icon={Redo2} variant="ghost" size="sm" disabled={!canRedo} onClick={onRedo} />
          </Tooltip>

          {saveStatus === "saving" && (
            <span className="ml-1 flex items-center gap-1 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="ml-1 flex items-center gap-1 text-xs text-muted">
              <CheckCircle2 className="size-3.5 text-success" />
              Saved
            </span>
          )}
        </div>
      </div>

      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-lg px-3 py-2 ${
          showDriftPrompt ? "bg-warning/10 ring-1 ring-warning/25" : ""
        }`}
      >
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

        {showDriftPrompt && (
          <>
            <span className="ml-1 text-[11px] font-semibold text-warning">
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
    </header>
  );
}
