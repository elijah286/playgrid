"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Save,
  MousePointer,
} from "lucide-react";
import Link from "next/link";
import {
  saveFormationAction,
  saveFormationInPlaybooksAction,
  updateFormationAction,
  type SavedFormation,
} from "@/app/actions/formations";
import { PlaybookFormationSearchMenu } from "@/features/formations/PlaybookFormationSearchMenu";
import {
  Button,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import { EditorCanvas } from "@/features/editor/EditorCanvas";
import { FormationInspector } from "@/features/editor/FormationInspector";
import { usePlayEditor } from "@/features/editor/usePlayEditor";
import { ExamplePreviewBanner } from "@/features/admin/ExamplePreviewBanner";
import { useExamplePreview } from "@/features/admin/ExamplePreviewContext";
import {
  createEmptyPlayDocument,
  defaultDefendersForVariant,
  defaultPlayersForVariant,
  defaultSpecialTeamsPlayers,
  SPORT_VARIANT_LABELS,
  sportProfileForVariant,
} from "@/domain/play/factory";
import type { PlayDocument, Player, SportVariant } from "@/domain/play/types";
import { fieldAspectFor } from "@/domain/play/render-config";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";

const SPORT_OPTIONS = (
  Object.entries(SPORT_VARIANT_LABELS) as [SportVariant, string][]
).map(([value, label]) => ({ value, label }));

/** Which side of the ball this editor is drawing. */
export type FormationEditorKind = "offense" | "defense" | "special_teams";

/**
 * Special teams is tackle-only — `specialTeamsTemplates` is authored for 11
 * players, and every other surface gates the option the same way. Offering it
 * on a 5v5 playbook would advertise a roster we can't produce.
 */
export function kindOptionsForVariant(
  variant: SportVariant,
): { value: FormationEditorKind; label: string }[] {
  const opts: { value: FormationEditorKind; label: string }[] = [
    { value: "offense", label: "Offense" },
    { value: "defense", label: "Defense" },
  ];
  if (variant === "tackle_11") opts.push({ value: "special_teams", label: "Special teams" });
  return opts;
}

const NAME_PLACEHOLDER: Record<FormationEditorKind, string> = {
  offense: "e.g. Trips Right",
  defense: "e.g. Cover 3",
  special_teams: "e.g. Punt",
};

/** Offense is the unmarked default, so it reads "New formation" — same
 *  convention as the unbadged offense tiles on the Plays and Formations tabs.
 *  Trailing space is deliberate; the qualifier is optional. */
const HEADING_QUALIFIER: Record<FormationEditorKind, string> = {
  offense: "",
  defense: "defensive ",
  special_teams: "special teams ",
};

/** The blank roster for a side. One place, so the initial document, the Type
 *  switch, and the variant switch can't disagree about what a defense is. */
function defaultPlayersForKind(kind: FormationEditorKind, variant: SportVariant): Player[] {
  if (kind === "defense") return defaultDefendersForVariant(variant);
  if (kind === "special_teams") return defaultSpecialTeamsPlayers(variant);
  return defaultPlayersForVariant(variant);
}

type Props =
  | {
      mode: "new";
      /** Which side of the ball to draw (from ?kind= query param). */
      kind?: FormationEditorKind;
      /** Pre-selected sport variant (from ?variant= query param). */
      initialVariant?: SportVariant;
      /**
       * When set, the sport-type selector is disabled and locked to
       * `initialVariant`. Used when entering from a specific playbook —
       * a mismatched variant would silently hide the new formation from
       * the playbook's Formations tab.
       */
      lockVariant?: boolean;
      /** Play ID to return to after saving (from ?returnToPlay= query param). */
      returnToPlay?: string | null;
      /** Playbook ID to return to after saving (from ?returnToPlaybook=). */
      returnToPlaybook?: string | null;
    }
  | {
      mode: "edit";
      formationId: string;
      initialName: string;
      initialVariant: SportVariant;
      initialPlayers: Player[];
      /** The side this formation was created as. Immutable — `kind` is set at
       *  create time and updateFormationAction never rewrites it. */
      kind: FormationEditorKind;
      /** Playbook ID to return to after saving (from ?returnToPlaybook=). */
      returnToPlaybook?: string | null;
      /** Sibling formations in the same playbook for prev/next/all nav. */
      navFormations?: SavedFormation[];
    };

export function FormationEditorClient(props: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const { isPreview, blockIfPreview } = useExamplePreview();

  const defaultVariant: SportVariant =
    props.mode === "edit"
      ? props.initialVariant
      : (props.initialVariant ?? "flag_7v7");

  // Comes from the `formations.kind` column on edit, and ?kind= on create.
  // Never inferred from the players: a coach who relabels every defender to
  // "Other" must not have their defensive formation silently become an
  // offensive one on the next save.
  //
  // Editable while creating (the Type control below), fixed once saved:
  // updateFormationAction never rewrites `kind`, and flipping a saved
  // formation's side would strand the plays already linked to it.
  const [kind, setKind] = useState<FormationEditorKind>(
    props.mode === "edit" ? props.kind : (props.kind ?? "offense"),
  );

  /* ── name + sport variant ── */
  const [name, setName] = useState(
    props.mode === "edit" ? props.initialName : "",
  );
  const [variant, setVariant] = useState<SportVariant>(defaultVariant);

  /* ── play-document state (drives the canvas) ──
   *
   * The scratch document must declare its side. EditorCanvas reads
   * metadata.playType to decide which way to clamp a dragged player against
   * the LOS (defenders above, offense below); without it a defender whose
   * role is "Other" gets clamped as offense and can be dragged onto the
   * offense's side of the ball. It also drives which roles the inspector
   * offers. */
  const buildDoc = (
    k: FormationEditorKind,
    v: SportVariant,
    players: Player[],
  ): PlayDocument => {
    const base = createEmptyPlayDocument({ sportProfile: sportProfileForVariant(v) });
    return {
      ...base,
      metadata: { ...base.metadata, playType: k },
      layers: { ...base.layers, players },
    };
  };

  const initialDoc =
    props.mode === "edit"
      ? buildDoc(props.kind, props.initialVariant, props.initialPlayers)
      : buildDoc(
          props.kind ?? "offense",
          defaultVariant,
          defaultPlayersForKind(props.kind ?? "offense", defaultVariant),
        );

  const { doc, dispatch, replaceDocument } = usePlayEditor(initialDoc);

  /* ── selection state ── */
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  /* ── side change swaps the roster (and its iconography) ── */
  function handleKindChange(v: string) {
    const next = v as FormationEditorKind;
    setKind(next);
    replaceDocument(buildDoc(next, variant, defaultPlayersForKind(next, variant)));
    setSelectedPlayerId(null);
  }

  /* ── sport-variant change resets the canvas ── */
  function handleVariantChange(v: string) {
    const next = v as SportVariant;
    setVariant(next);
    // Special teams only exists in tackle. Leaving the Type on special teams
    // after switching to 5v5 would leave a side the roster can't fill, so it
    // falls back to offense rather than rendering an empty field.
    const nextKind: FormationEditorKind =
      kind === "special_teams" && next !== "tackle_11" ? "offense" : kind;
    if (nextKind !== kind) setKind(nextKind);
    replaceDocument(buildDoc(nextKind, next, defaultPlayersForKind(nextKind, next)));
    setSelectedPlayerId(null);
  }

  /* ── save ── */
  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Enter a formation name", "error");
      return;
    }
    if (
      blockIfPreview(
        "This formation is just a demo — it won't be saved. Create your own playbook to keep your work.",
      )
    ) {
      return;
    }
    setSaving(true);
    let res: { ok: boolean; error?: string };
    const losY = typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
    if (props.mode === "edit") {
      res = await updateFormationAction(
        props.formationId,
        trimmed,
        doc.layers.players,
        doc.sportProfile,
        losY,
      );
    } else {
      // New formation: returnToPlaybook can be a single id or a comma-joined
      // list (from the multi-select picker). In either case we save into
      // every listed playbook.
      const raw = props.returnToPlaybook ?? "";
      const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        setSaving(false);
        toast("Pick a playbook first.", "error");
        return;
      }
      if (ids.length === 1) {
        res = await saveFormationAction(
          trimmed,
          doc.layers.players,
          doc.sportProfile,
          losY,
          kind,
          ids[0],
        );
      } else {
        const multi = await saveFormationInPlaybooksAction(
          trimmed,
          doc.layers.players,
          doc.sportProfile,
          losY,
          kind,
          ids,
        );
        if (multi.ok && multi.errors.length === 0) {
          res = { ok: true };
        } else if (multi.ok) {
          res = { ok: false, error: `Saved to ${multi.created.length} of ${ids.length} playbooks.` };
        } else {
          res = { ok: false, error: multi.error };
        }
      }
    }
    if (!res.ok) {
      setSaving(false);
      toast(res.error ?? "Something went wrong.", "error");
      return;
    }
    toast(
      props.mode === "edit" ? "Formation updated" : "Formation saved",
      "success",
    );
    // Return precedence: specific play editor > playbook Formations tab >
    // global formations list. Keeps users in the context they started from.
    const returnToPlay = props.mode === "new" ? props.returnToPlay : null;
    const raw =
      (props.mode === "new" || props.mode === "edit") ? props.returnToPlaybook ?? "" : "";
    const firstPlaybook = raw.split(",").map((s) => s.trim()).filter(Boolean)[0] ?? null;
    const returnTo = returnToPlay
      ? `/plays/${returnToPlay}/edit`
      : firstPlaybook
        ? `/playbooks/${firstPlaybook}?tab=formations`
        : "/formations";
    router.push(returnTo);
  }

  const fieldAspect = fieldAspectFor(doc);

  const returnRaw =
    (props.mode === "new" || props.mode === "edit") ? props.returnToPlaybook ?? "" : "";
  const returnFirstPb =
    returnRaw.split(",").map((s) => s.trim()).filter(Boolean)[0] ?? null;
  const backHref = returnFirstPb
    ? `/playbooks/${returnFirstPb}?tab=formations`
    : "/formations";
  const backLabel = returnFirstPb ? "Playbook" : "Formations";

  const navFormations =
    props.mode === "edit" ? props.navFormations ?? [] : [];
  const sortedNav = useMemo(
    () => [...navFormations].sort((a, b) => a.sortOrder - b.sortOrder),
    [navFormations],
  );
  const currentIx =
    props.mode === "edit"
      ? sortedNav.findIndex((f) => f.id === props.formationId)
      : -1;
  const prevFormation = currentIx > 0 ? sortedNav[currentIx - 1] : null;
  const nextFormation =
    currentIx >= 0 && currentIx < sortedNav.length - 1
      ? sortedNav[currentIx + 1]
      : null;

  function navigateToFormation(id: string) {
    const qs = returnFirstPb ? `?returnToPlaybook=${returnFirstPb}` : "";
    router.push(`/formations/${id}/edit${qs}`);
  }

  return (
    // Same width cap as the play editor, deliberately the same class rather
    // than a copy of its calc — the two editors show the same field and drifted
    // apart precisely because they sized it independently. `.play-editor-content`
    // caps this wrapper (and so the header and the grid below) to the field at
    // its natural max size, reading `--field-aspect` from here.
    <div
      className="play-editor-content flex flex-col gap-5"
      style={{ ["--field-aspect" as string]: String(fieldAspect) }}
    >
      {isPreview && <ExamplePreviewBanner />}
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" leftIcon={ArrowLeft}>
            {backLabel}
          </Button>
        </Link>
        <h1 className="text-lg font-bold text-foreground">
          {`${props.mode === "edit" ? "Edit" : "New"} ${HEADING_QUALIFIER[kind]}formation`}
        </h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {props.mode === "edit" && sortedNav.length > 1 && (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                leftIcon={ChevronLeft}
                disabled={!prevFormation}
                onClick={() =>
                  prevFormation && navigateToFormation(prevFormation.id)
                }
              >
                Previous formation
              </Button>
              <PlaybookFormationSearchMenu
                formations={sortedNav}
                currentFormationId={props.formationId}
                onNavigate={navigateToFormation}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                rightIcon={ChevronRight}
                disabled={!nextFormation}
                onClick={() =>
                  nextFormation && navigateToFormation(nextFormation.id)
                }
              >
                Next formation
              </Button>
            </div>
          )}
          {props.mode === "edit" && returnFirstPb && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={FilePlus}
              onClick={() =>
                router.push(
                  `/plays/new?playbookId=${returnFirstPb}&formationId=${props.formationId}`,
                )
              }
            >
              Create play using formation
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            leftIcon={Save}
            loading={saving}
            onClick={handleSave}
          >
            {props.mode === "edit" ? "Save changes" : "Save formation"}
          </Button>
        </div>
      </header>

      {(() => {
        const max = defaultSettingsForVariant(variant).maxPlayers;
        const count = doc.layers.players.length;
        return count > max ? (
          <p className="-mt-2 text-xs font-medium text-danger">
            {count} players — {SPORT_VARIANT_LABELS[variant]} allows only {max}.
          </p>
        ) : null;
      })()}

      {/* Name + sport row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Sport type</label>
          <Select
            value={variant}
            onChange={handleVariantChange}
            options={SPORT_OPTIONS}
            className="w-44"
            // Locked when entering from a specific playbook — a mismatched
            // variant would silently hide the formation from that playbook's
            // Formations tab. Also locked in edit mode (changing variant
            // would orphan the existing player layout).
            disabled={props.mode === "new" && props.lockVariant === true}
          />
          {props.mode === "new" && props.lockVariant === true ? (
            <p className="text-[11px] text-muted">
              Locked to this playbook&apos;s sport type.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Type</label>
          <Select
            value={kind}
            onChange={handleKindChange}
            options={kindOptionsForVariant(variant)}
            className="w-40"
            // Fixed once saved: updateFormationAction never rewrites `kind`,
            // and flipping a saved formation's side would strand the plays
            // already linked to it.
            disabled={props.mode === "edit"}
          />
          {props.mode === "edit" ? (
            <p className="text-[11px] text-muted">
              Set when the formation was created.
            </p>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Formation name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={NAME_PLACEHOLDER[kind]}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
      </div>

      {/* Editor area */}
      {/* Matches the play editor's grid: minmax(0,1fr) so the field column can
          actually shrink, and a 320px sidebar (was 280px) so the two editors'
          inspectors are the same width. */}
      <div className="grid min-h-0 min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Canvas */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-muted">
            <MousePointer className="size-4 shrink-0" />
            <span>
              Drag players to reposition. Click a player to edit its label,
              role, and style.
            </span>
          </div>
          {/* The field's own aspect, same as the play editor — not a fixed box.
              The 8:5 this used to hardcode is flag_7v7's ratio, so 7v7 looked
              right by coincidence while flag_5v5 (1.33) rendered 20% too wide
              and tackle_11 (2.83) far too narrow, each letterboxed against the
              green backdrop that hid the mismatch. Switching Sport type now
              reshapes the box, which is the honest outcome: it IS a different
              field. `field-viewport` adds the shared mobile height cap. */}
          <div
            className="field-viewport relative mx-auto w-full overflow-hidden rounded-xl bg-surface-inset"
            style={
              {
                aspectRatio: `${fieldAspect} / 1`,
                ["--field-aspect" as string]: String(fieldAspect),
              } as React.CSSProperties
            }
          >
            <EditorCanvas
              doc={doc}
              dispatch={dispatch}
              mode="formation"
              selectedPlayerId={selectedPlayerId}
              selectedRouteId={null}
              selectedNodeId={null}
              selectedSegmentId={null}
              onSelectPlayer={setSelectedPlayerId}
              onSelectRoute={() => {}}
              onSelectNode={() => {}}
              onSelectSegment={() => {}}
              activeShape="straight"
              activeStrokePattern="solid"
              activeColor="#FFFFFF"
              activeWidth={2.5}
              fieldAspect={fieldAspect}
              fieldBackground={doc.fieldBackground ?? "green"}
            />
          </div>
        </div>

        {/* Inspector */}
        <aside className="rounded-xl border border-border bg-surface-raised p-4">
          <FormationInspector
            doc={doc}
            dispatch={dispatch}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={setSelectedPlayerId}
          />
        </aside>
      </div>
    </div>
  );
}
