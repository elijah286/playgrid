"use client";

import { useEffect } from "react";
import { ArrowLeft, Camera, PencilLine, Plus, X } from "lucide-react";
import type { Player, PlayType, SportVariant } from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import type {
  DefenseTemplate,
  SpecialTeamsTemplate,
} from "@/domain/play/factory";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { MiniFormationDiagram } from "./MiniFormationDiagram";

/** Which of the two disclosure levels the sheet is showing. */
export type CreatePlayLevel = "method" | "draw";

/** The three play kinds a coach can draw. Practice plans aren't created here. */
export type DrawPlayType = Extract<
  PlayType,
  "offense" | "defense" | "special_teams"
>;

export type CreatePlaySheetProps = {
  open: boolean;
  onClose: () => void;

  level: CreatePlayLevel;
  /** method → draw */
  onChooseDraw: () => void;
  /** draw → method */
  onBack: () => void;

  // ---- Level 1: method ----
  /** Hide the Cal card when the viewer has no Coach Cal access at all. */
  showCoachCal: boolean;
  onGenerateWithCal: () => void;
  /** Show the "Import from a photo" card (photo_play_import beta — admin only
   *  today). Hidden when unavailable so non-admins never see it. */
  showPhotoImport: boolean;
  onImportPhoto: () => void;

  // ---- Level 2: draw ----
  variant: SportVariant;
  playType: DrawPlayType;
  onChangePlayType: (t: DrawPlayType) => void;
  expectedOffenseCount: number;
  defenseCount: number;
  /** Player layouts for the "Blank" thumbnails. */
  defaultOffensePlayers: Player[];
  defaultDefenders: Player[];
  formations: SavedFormation[];
  loadingFormations: boolean;
  defenseTemplates: DefenseTemplate[];
  stTemplates: SpecialTeamsTemplate[];
  /** True while a create request is in flight — locks the whole sheet. */
  creating: boolean;

  onPickBlank: () => void;
  onPickFormation: (f: SavedFormation) => void;
  onPickDefenseTemplate: (t: DefenseTemplate) => void;
  onPickSTTemplate: (t: SpecialTeamsTemplate) => void;
  onCreateNewFormation: () => void;
};

const PLAY_TYPE_LABELS: Record<DrawPlayType, string> = {
  offense: "Offense",
  defense: "Defense",
  special_teams: "Special teams",
};

/**
 * The unified "start a new play" surface. One component renders as a
 * centered modal on desktop and a bottom sheet on mobile (only the
 * container chrome differs by breakpoint). Two levels of progressive
 * disclosure:
 *
 *   Level 1 (method)  — Generate with Coach Cal · Draw it yourself
 *   Level 2 (draw)    — Offense / Defense / Special teams, then start from
 *                       Blank · a saved formation · a ready-made play
 *
 * All create logic lives in the caller (via callbacks) — this component is
 * purely presentational so the same surface can be mounted from the
 * playbook grid and from inside the editor.
 */
export function CreatePlaySheet(props: CreatePlaySheetProps) {
  const { open, onClose, level, creating } = props;

  // Escape closes the sheet, matching every other modal surface in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, creating, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Start a new play"
      onClick={(e) => {
        if (creating) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-tutor="new-play-dialog"
        className="relative flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-border bg-surface-raised shadow-elevated sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {level === "draw" && (
              <button
                type="button"
                aria-label="Back"
                onClick={props.onBack}
                disabled={creating}
                className="-ml-1.5 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground disabled:opacity-40"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground">
                {level === "method" ? "Start a new play" : "Draw it yourself"}
              </h2>
              <p className="mt-0.5 truncate text-xs text-muted">
                {level === "method"
                  ? "How do you want to make this play?"
                  : "Pick a side, then a starting point."}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={creating}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-inset hover:text-foreground disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {level === "method" ? (
            <MethodLevel {...props} />
          ) : (
            <DrawLevel {...props} />
          )}
        </div>

        {/* A subtle grabber on mobile for the sheet metaphor. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-border sm:hidden"
          aria-hidden
        />
      </div>
    </div>
  );
}

function MethodLevel({
  showCoachCal,
  onGenerateWithCal,
  showPhotoImport,
  onImportPhoto,
  onChooseDraw,
  creating,
}: CreatePlaySheetProps) {
  return (
    <div className="flex flex-col gap-3">
      {showCoachCal && (
        <button
          type="button"
          onClick={onGenerateWithCal}
          disabled={creating}
          className="group flex items-center gap-4 rounded-2xl border border-slate-900/10 p-4 text-left transition-shadow hover:shadow disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
            color: "#0f172a",
          }}
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/70">
            <CoachAiIcon className="size-7" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold">
              Generate with Coach Cal
            </span>
            <span className="block text-sm opacity-80">
              Describe a play in plain English — Cal draws it for you.
            </span>
          </span>
        </button>
      )}

      {showPhotoImport && (
        <button
          type="button"
          onClick={onImportPhoto}
          disabled={creating}
          className="group flex items-center gap-4 rounded-2xl border border-border bg-surface-base p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
            <Camera className="size-7" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-foreground">
              Import from a photo
            </span>
            <span className="block text-sm text-muted">
              Snap a play sheet or hand-drawn play — we read it into a play.
            </span>
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={onChooseDraw}
        disabled={creating}
        className="group flex items-center gap-4 rounded-2xl border border-border bg-surface-base p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PencilLine className="size-7" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-bold text-foreground">
            Draw it yourself
          </span>
          <span className="block text-sm text-muted">
            Start from a formation, a template, or a blank field.
          </span>
        </span>
      </button>
    </div>
  );
}

function DrawLevel(props: CreatePlaySheetProps) {
  const {
    variant,
    playType,
    onChangePlayType,
    expectedOffenseCount,
    defenseCount,
    defaultOffensePlayers,
    defaultDefenders,
    formations,
    loadingFormations,
    defenseTemplates,
    stTemplates,
    creating,
    onPickBlank,
    onPickFormation,
    onPickDefenseTemplate,
    onPickSTTemplate,
    onCreateNewFormation,
  } = props;

  const showSpecialTeams = variant === "tackle_11";
  const types: DrawPlayType[] = showSpecialTeams
    ? ["offense", "defense", "special_teams"]
    : ["offense", "defense"];

  // Saved formations for the active side, filtered the same way the legacy
  // picker did (variant match for offense; kind match for defense/ST).
  const savedForType = formations.filter((f) => {
    if (playType === "offense") {
      if ((f.kind ?? "offense") !== "offense") return false;
      const fv = f.sportProfile?.variant as SportVariant | undefined;
      if (fv) return fv === variant;
      return f.players.length === expectedOffenseCount;
    }
    return f.kind === playType;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Type segmented control */}
      <div
        role="tablist"
        aria-label="Play type"
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${types.length}, minmax(0, 1fr))` }}
      >
        {types.map((t) => {
          const active = t === playType;
          const sub =
            t === "offense"
              ? `${expectedOffenseCount} players`
              : t === "defense"
                ? `${defenseCount} defenders`
                : "Punt · kick · FG";
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={creating}
              onClick={() => onChangePlayType(t)}
              data-tutor={t === "defense" ? "new-play-defense-section" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2.5 text-center transition-colors disabled:opacity-50 ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface-raised text-muted hover:border-primary/60 hover:bg-surface-inset"
              }`}
            >
              <span
                className={`text-sm font-bold ${active ? "text-foreground" : "text-foreground/80"}`}
              >
                {PLAY_TYPE_LABELS[t]}
              </span>
              <span className="text-[11px] leading-tight text-muted">{sub}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Start from…
      </p>

      {/* Start-from options for the active type */}
      <div className="flex flex-col gap-3">
        {playType === "offense" && (
          <div className="grid grid-cols-2 gap-3">
            <StartCard
              title="Blank"
              subtitle={`${expectedOffenseCount} players, no routes`}
              onClick={onPickBlank}
              disabled={creating}
              recommended
              diagram={<MiniFormationDiagram players={defaultOffensePlayers} />}
            />
            <StartCard
              title="Create new formation"
              subtitle="Design a layout from scratch"
              onClick={onCreateNewFormation}
              disabled={creating}
              dashed
              diagram={
                <span className="flex size-20 items-center justify-center rounded-md bg-surface-raised text-muted">
                  <Plus className="size-7" />
                </span>
              }
            />
          </div>
        )}

        {playType === "defense" && (
          <div className="grid grid-cols-2 gap-3">
            <StartCard
              title="Blank"
              subtitle={`${defenseCount} defenders`}
              onClick={onPickBlank}
              disabled={creating}
              recommended
              diagram={<MiniFormationDiagram players={defaultDefenders} />}
            />
          </div>
        )}

        {/* Ready-made plays (defense / special teams templates) */}
        {playType === "defense" && defenseTemplates.length > 0 && (
          <TemplateGroup label="Ready-made defenses">
            {defenseTemplates.map((t) => (
              <StartCard
                key={t.key}
                title={t.displayName}
                subtitle={`${t.players.length} defenders`}
                onClick={() => onPickDefenseTemplate(t)}
                disabled={creating}
                title2={t.description}
                diagram={<MiniFormationDiagram players={t.players} />}
              />
            ))}
          </TemplateGroup>
        )}

        {playType === "special_teams" && showSpecialTeams && (
          <TemplateGroup label="Special teams units">
            {stTemplates.map((t) => (
              <StartCard
                key={t.key}
                title={t.displayName}
                subtitle={`${t.players.length} players`}
                onClick={() => onPickSTTemplate(t)}
                disabled={creating}
                title2={t.description}
                diagram={<MiniFormationDiagram players={t.players} />}
              />
            ))}
          </TemplateGroup>
        )}

        {/* Saved formations for this side */}
        {loadingFormations ? (
          <p className="py-4 text-center text-sm text-muted">
            Loading your formations…
          </p>
        ) : savedForType.length > 0 ? (
          <TemplateGroup label="Your formations">
            {savedForType.map((f) => (
              <StartCard
                key={f.id}
                title={f.displayName}
                subtitle={`${f.players.length} players`}
                onClick={() => onPickFormation(f)}
                disabled={creating}
                diagram={<MiniFormationDiagram players={f.players} />}
              />
            ))}
          </TemplateGroup>
        ) : null}
      </div>
    </div>
  );
}

function TemplateGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function StartCard({
  title,
  subtitle,
  title2,
  onClick,
  disabled,
  diagram,
  recommended,
  dashed,
}: {
  title: string;
  subtitle: string;
  /** Native tooltip (e.g. a template's longer description). */
  title2?: string;
  onClick: () => void;
  disabled?: boolean;
  diagram: React.ReactNode;
  recommended?: boolean;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title2}
      className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors disabled:opacity-50 ${
        recommended
          ? "border-2 border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"
          : dashed
            ? "border border-dashed border-border bg-surface-inset hover:border-primary hover:bg-primary/5"
            : "border border-border bg-surface-inset hover:border-primary hover:bg-primary/5"
      }`}
    >
      {diagram}
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </button>
  );
}
