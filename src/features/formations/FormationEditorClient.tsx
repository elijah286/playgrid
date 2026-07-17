"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Plus,
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
import { BackIcon } from "@/components/ui/LinkPendingSpinner";
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
  newPlayerForKind,
  SPORT_VARIANT_LABELS,
  sportProfileForVariant,
} from "@/domain/play/factory";
import type { PlayDocument, Player, SportVariant } from "@/domain/play/types";
import { KIND_LABEL, type FormationEditorKind } from "./formationKind";

// NOT re-exported. Re-exporting from a "use client" module makes the export a
// client reference again — the very bug this move fixes. Consumers import from
// ./formationKind directly.
import { fieldAspectFor } from "@/domain/play/render-config";

const SPORT_OPTIONS = (
  Object.entries(SPORT_VARIANT_LABELS) as [SportVariant, string][]
).map(([value, label]) => ({ value, label }));

/**
 * Sport types this side can actually be built for.
 *
 * Special teams fields 11 and only tackle has a roster for it. The side is
 * fixed once the editor opens, so an unlocked Sport type could otherwise strand
 * a special-teams formation on 5v5 with no players and no way back. Removing
 * the impossible options beats resetting the coach's Type behind their back.
 */
function sportOptionsForKind(kind: FormationEditorKind) {
  if (kind !== "special_teams") return SPORT_OPTIONS;
  return SPORT_OPTIONS.filter((o) => o.value === "tackle_11");
}

const NAME_PLACEHOLDER: Record<FormationEditorKind, string> = {
  offense: "e.g. Trips Right",
  defense: "e.g. Cover 3",
  special_teams: "e.g. Punt",
};

/** "5v5 Flag defense fields 5" — names the side the count belongs to, since
 *  offense and defense can field different numbers. */
const KIND_NOUN: Record<FormationEditorKind, string> = {
  offense: "offense",
  defense: "defense",
  special_teams: "special teams",
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

  // Comes from the `formations.kind` column on edit, and ?kind= on create —
  // the New formation picker asks before routing here. Fixed for the life of
  // the editor, hence a const rather than state: nothing in here can change
  // it, so it can't be got wrong.
  //
  // Never inferred from the players either: a coach who relabels every
  // defender to "Other" must not have their defensive formation silently
  // become an offensive one on the next save.
  const kind: FormationEditorKind =
    props.mode === "edit" ? props.kind : (props.kind ?? "offense");

  /* ── name + sport variant ── */
  const [name, setName] = useState(
    props.mode === "edit" ? props.initialName : "",
  );
  const [variant, setVariant] = useState<SportVariant>(defaultVariant);

  // Editing always locks: handleVariantChange resets the canvas, which on a
  // saved formation means discarding the layout the coach is here to edit.
  const variantLocked =
    props.mode === "edit" || props.lockVariant === true;

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

  /**
   * How many players this side fields in this game type, and how far off we
   * are. Applies to every side, not just offense — a 6th defender in 5v5 is
   * exactly as wrong as a 6th receiver.
   *
   * A warning, never a block: coaches build mid-thought, and a formation that's
   * one short while they drag the next player in isn't an error. Special teams
   * has no count of its own on SportProfile; it fields the same 11 as offense
   * in tackle, which is the only variant that offers it.
   */
  const expectedPlayerCount =
    kind === "defense"
      ? doc.sportProfile.defensePlayerCount
      : doc.sportProfile.offensePlayerCount;
  const actualPlayerCount = doc.layers.players.length;
  const countDelta = actualPlayerCount - expectedPlayerCount;

  /* ── add a player ── */
  const addPlayerAt = (position: { x: number; y: number }) => {
    const player = newPlayerForKind(kind, position, doc.layers.players);
    dispatch({ type: "player.add", player });
    setSelectedPlayerId(player.id);
  };

  /** Drop a new player in open space rather than on top of someone. Walks
   *  down from just behind the LOS (or just in front, for defense) until it
   *  finds a gap, then gives up and takes the middle — the coach can drag it. */
  const addPlayerCentered = () => {
    const losY = typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
    const dir = kind === "defense" ? 1 : -1;
    const taken = doc.layers.players.map((p) => p.position);
    for (let step = 1; step <= 6; step++) {
      const y = losY + dir * step * 0.06;
      if (y < 0.05 || y > 0.95) break;
      const clear = taken.every((t) => Math.hypot(t.x - 0.5, t.y - y) > 0.06);
      if (clear) return addPlayerAt({ x: 0.5, y });
    }
    addPlayerAt({ x: 0.5, y: losY + dir * 0.08 });
  };

  /* ── sport-variant change resets the canvas ── */
  function handleVariantChange(v: string) {
    const next = v as SportVariant;
    setVariant(next);
    replaceDocument(buildDoc(kind, next, defaultPlayersForKind(kind, next)));
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
          {/* Swap the arrow for a spinner while the nav is in flight, same as
              the play editor's back link — going back is a dynamic route too,
              and a dead-looking button gets tapped twice. BackIcon reads the
              nearest ancestor Link's pending state, so it must stay inside
              this Link. */}
          {/* BackIcon as a child rather than `leftIcon`: that prop is typed
              LucideIcon and BackIcon is a plain component. The button's own
              gap-1.5 spaces it identically, which beats widening a shared
              primitive's type for one caller. */}
          <Button variant="ghost" size="sm">
            <BackIcon className="size-4" />
            {backLabel}
          </Button>
        </Link>
        {/* Structural, never the formation's name. It used to read "New
            defensive formation", which competed with the Formation name field
            right below it — two prominent strings, no way to tell which one
            the coach was supposed to be looking at. The Type control states
            the side; this states what you're doing. */}
        <h1 className="text-lg font-bold text-foreground">
          {props.mode === "edit" ? "Edit formation" : "New formation"}
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

      {/* One warning, not two. This replaced a red "N players — 5v5 Flag
          allows only 5" banner that (a) stated a prohibition it never
          enforced — Save always worked — (b) only fired when OVER, so a
          formation one player SHORT looked fine, and (c) read the playbook's
          maxPlayers rather than the side's roster, so it couldn't speak about
          defense. Amber because it warns; red promised a block. */}
      {countDelta !== 0 && (
        <p role="status" className="-mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          {countDelta > 0
            ? `${actualPlayerCount} players — ${SPORT_VARIANT_LABELS[variant]} ${KIND_NOUN[kind]} fields ${expectedPlayerCount}. You can still save this, but it won't match the game type.`
            : `${actualPlayerCount} of ${expectedPlayerCount} players — ${SPORT_VARIANT_LABELS[variant]} ${KIND_NOUN[kind]} fields ${expectedPlayerCount}.`}
        </p>
      )}

      {/* Name + sport row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Sport type</label>
          {/* Locked when entering from a specific playbook (a mismatched
              variant would silently hide the formation from that playbook's
              Formations tab), and when editing (changing variant resets the
              canvas, which would throw away the saved layout).

              A disabled dropdown promises a choice it won't honour, so when
              it's locked we just state the value. NB the old `disabled` prop
              only covered the "new" arm — edit mode rendered an ENABLED
              select despite its comment claiming otherwise, so changing sport
              type while editing silently wiped the formation's players. */}
          {variantLocked ? (
            <p className="flex h-9 items-center text-sm font-medium text-foreground">
              {SPORT_VARIANT_LABELS[variant]}
            </p>
          ) : (
            <Select
              value={variant}
              onChange={handleVariantChange}
              options={sportOptionsForKind(kind)}
              className="w-44"
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Type</label>
          {/* Always stated, never a control. The side is chosen before the
              editor opens (the New formation picker, or the side you were on
              in the new-play dialog) and is fixed from then on.

              Changing it isn't a field edit: the players would have to convert
              (receivers into defenders, circles into triangles), the layout
              would have to mirror across the LOS, and on a saved formation
              every play already linked to it would inherit the result. That's
              a conversion feature. Until it exists, the honest UI is to state
              the answer rather than offer a select that has to undo itself. */}
          <p className="flex h-9 items-center text-sm font-medium text-foreground">
            {KIND_LABEL[kind]}
          </p>
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
        <aside className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
          <FormationInspector
            doc={doc}
            dispatch={dispatch}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={setSelectedPlayerId}
          />

          {/* Players can be deleted from the inspector, so there has to be a
              way back. Always available, including while a player is selected
              — gating it on the all-players view would mean deselecting first
              for no reason. Adding is deliberately explicit: clicking the
              field used to add a player, which fired on any stray click. */}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Plus}
            onClick={addPlayerCentered}
            className="w-full"
          >
            Add player
          </Button>
        </aside>
      </div>
    </div>
  );
}
