"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

type MetadataPatch = {
  descriptionOverride: string | null;
  bodyOverride: string | null;
  whenToUseOverride: string | null;
  commonMistakesOverride: string[] | null;
};

/** Concept-level metadata editor. Collapsible card above the play
 *  diagram editor. Four fields:
 *
 *  - **Description**: one-line tactical summary (the chip on the
 *    variant page header).
 *  - **Body**: longer prose under the diagram.
 *  - **When to call it**: coaching guidance.
 *  - **Common mistakes**: bullet list (one per line in the textarea).
 *
 *  Each field shows the catalog default as a placeholder so admins
 *  know what currently ships when they leave the override empty.
 *  Empty overrides collapse to null at the save boundary (no
 *  whitespace-only saves).
 *
 *  Independent save path — does NOT trigger the play-doc autosave.
 *  Admins click "Save metadata" explicitly. The dirty indicator
 *  flips on any field change and clears on a successful save. */
export function MetadataEditor({
  catalogDefaults,
  initialMetadata,
  onSave,
}: {
  catalogDefaults: {
    description: string;
    body: string;
    whenToUse: string;
    commonMistakes: string[];
  };
  initialMetadata: MetadataPatch;
  onSave: (patch: MetadataPatch) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  // Open by default when at least one override is set — that's a
  // strong signal the admin came here to edit metadata. Closed when
  // every override is null (admin is here for the diagram).
  const hasAnyOverride =
    initialMetadata.descriptionOverride != null ||
    initialMetadata.bodyOverride != null ||
    initialMetadata.whenToUseOverride != null ||
    initialMetadata.commonMistakesOverride != null;
  const [open, setOpen] = useState(hasAnyOverride);

  // Form state — initialised from the override; empty string when
  // no override exists (the catalog default shows as placeholder).
  const [description, setDescription] = useState(
    initialMetadata.descriptionOverride ?? "",
  );
  const [body, setBody] = useState(initialMetadata.bodyOverride ?? "");
  const [whenToUse, setWhenToUse] = useState(
    initialMetadata.whenToUseOverride ?? "",
  );
  // Common mistakes uses a textarea (one item per line) for parity
  // with the simple admin UX. Joined for display; split on save.
  const [commonMistakesText, setCommonMistakesText] = useState(
    (initialMetadata.commonMistakesOverride ?? []).join("\n"),
  );

  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
    if (error) setError(null);
  };

  const handleSave = () => {
    setError(null);
    const patch: MetadataPatch = {
      // Empty string → null so the save endpoint clears the column.
      descriptionOverride: description.trim() === "" ? null : description,
      bodyOverride: body.trim() === "" ? null : body,
      whenToUseOverride: whenToUse.trim() === "" ? null : whenToUse,
      commonMistakesOverride:
        commonMistakesText.trim() === ""
          ? null
          : commonMistakesText
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
    };
    startSave(async () => {
      const res = await onSave(patch);
      if (res.ok) {
        setIsDirty(false);
      } else {
        setError(res.error);
      }
    });
  };

  const handleResetField = (field: keyof MetadataPatch) => {
    if (field === "descriptionOverride") setDescription("");
    if (field === "bodyOverride") setBody("");
    if (field === "whenToUseOverride") setWhenToUse("");
    if (field === "commonMistakesOverride") setCommonMistakesText("");
    markDirty();
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface-raised">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
        )}
        <span className="text-sm font-semibold text-foreground">
          Concept metadata
        </span>
        {hasAnyOverride && (
          <span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-semibold text-primary">
            Override active
          </span>
        )}
        {isDirty && (
          <span className="text-xs text-amber-600">· Unsaved changes</span>
        )}
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <FieldRow
            label="Description"
            help="One-line tactical summary. Shown in the variant page header and meta description."
            catalogDefault={catalogDefaults.description}
            value={description}
            isOverride={description.trim() !== ""}
            onChange={(v) => {
              setDescription(v);
              markDirty();
            }}
            onReset={() => handleResetField("descriptionOverride")}
            multiline={false}
          />
          <FieldRow
            label="Body"
            help="Longer prose shown under the diagram. Falls back to Description when blank in code; same fallback here."
            catalogDefault={catalogDefaults.body}
            value={body}
            isOverride={body.trim() !== ""}
            onChange={(v) => {
              setBody(v);
              markDirty();
            }}
            onReset={() => handleResetField("bodyOverride")}
            multiline
            rows={4}
          />
          <FieldRow
            label="When to call it"
            help="Coaching guidance shown as the 'When to call it' section."
            catalogDefault={catalogDefaults.whenToUse}
            value={whenToUse}
            isOverride={whenToUse.trim() !== ""}
            onChange={(v) => {
              setWhenToUse(v);
              markDirty();
            }}
            onReset={() => handleResetField("whenToUseOverride")}
            multiline
            rows={3}
          />
          <FieldRow
            label="Common mistakes"
            help="One bullet per line. Shown as a bulleted list under 'Common mistakes'."
            catalogDefault={catalogDefaults.commonMistakes.join("\n")}
            value={commonMistakesText}
            isOverride={commonMistakesText.trim() !== ""}
            onChange={(v) => {
              setCommonMistakesText(v);
              markDirty();
            }}
            onReset={() => handleResetField("commonMistakesOverride")}
            multiline
            rows={5}
          />
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            {error && (
              <span className="mr-auto text-xs text-danger">{error}</span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isPending}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Saving…" : isDirty ? "Save metadata" : "Saved"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  help,
  catalogDefault,
  value,
  isOverride,
  onChange,
  onReset,
  multiline,
  rows,
}: {
  label: string;
  help: string;
  catalogDefault: string;
  value: string;
  isOverride: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
  multiline: boolean;
  rows?: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold text-foreground">
          {label}
          {isOverride && (
            <span className="ml-1.5 rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">
              override
            </span>
          )}
        </label>
        {isOverride && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
            title="Clear this override and use the catalog default."
          >
            <RotateCcw className="size-3" />
            Clear
          </button>
        )}
      </div>
      <p className="mb-1.5 text-[11px] text-muted">{help}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={catalogDefault || "(catalog default empty)"}
          rows={rows ?? 3}
          className="w-full rounded-md border border-border bg-surface-inset px-2 py-1.5 text-sm text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={catalogDefault || "(catalog default empty)"}
          className="w-full rounded-md border border-border bg-surface-inset px-2 py-1.5 text-sm text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none"
        />
      )}
    </div>
  );
}
