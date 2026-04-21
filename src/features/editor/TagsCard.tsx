"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import { Badge, Input } from "@/components/ui";
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
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  linkedFormation?: SavedFormation | null;
};

export function TagsCard({ doc, dispatch, linkedFormation }: Props) {
  const [tagDraft, setTagDraft] = useState("");
  const tags = doc.metadata.tags;
  const formationTag = doc.metadata.formationTag ?? null;
  const formationId = doc.metadata.formationId;
  const debouncedDoc = useDebouncedDoc(doc);
  const hasDrift = computeDrift(debouncedDoc, linkedFormation ?? null);

  const [stableDrift, setStableDrift] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStableDrift(hasDrift), hasDrift ? 500 : 0);
    return () => clearTimeout(t);
  }, [hasDrift]);
  useEffect(() => {
    const t = setTimeout(() => setStableDrift(false), 0);
    return () => clearTimeout(t);
  }, [formationId]);
  const showDriftPrompt = stableDrift && !formationTag;

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

  function setFormationTag(tag: string) {
    dispatch({ type: "document.setFormationTag", formationTag: tag || null });
  }

  function clearFormationTag() {
    dispatch({ type: "document.setFormationTag", formationTag: null });
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Tags</h3>
      <div className="flex flex-wrap items-center gap-1.5">
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
      </div>
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
        className="h-7 text-xs"
      />
      {formationId && showDriftPrompt && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-1.5 rounded-lg bg-warning/10 p-2 ring-1 ring-warning/25"
        >
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
        </div>
      )}
    </section>
  );
}
