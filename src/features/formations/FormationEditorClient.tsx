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
  defaultPlayersForVariant,
  SPORT_VARIANT_LABELS,
  sportProfileForVariant,
} from "@/domain/play/factory";
import type { Player, SportVariant } from "@/domain/play/types";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";

const SPORT_OPTIONS = (
  Object.entries(SPORT_VARIANT_LABELS) as [SportVariant, string][]
).map(([value, label]) => ({ value, label }));

type Props =
  | {
      mode: "new";
      /** Pre-selected sport variant (from ?variant= query param). */
      initialVariant?: SportVariant;
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

  /* ── name + sport variant ── */
  const [name, setName] = useState(
    props.mode === "edit" ? props.initialName : "",
  );
  const [variant, setVariant] = useState<SportVariant>(defaultVariant);

  /* ── play-document state (drives the canvas) ── */
  const initialDoc =
    props.mode === "edit"
      ? (() => {
          const base = createEmptyPlayDocument({
            sportProfile: sportProfileForVariant(props.initialVariant),
          });
          return {
            ...base,
            layers: { ...base.layers, players: props.initialPlayers },
          };
        })()
      : createEmptyPlayDocument({
          sportProfile: sportProfileForVariant(defaultVariant),
        });

  const { doc, dispatch, replaceDocument } = usePlayEditor(initialDoc);

  /* ── selection state ── */
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  /* ── sport-variant change resets the canvas ── */
  function handleVariantChange(v: string) {
    const next = v as SportVariant;
    setVariant(next);
    const freshDoc = createEmptyPlayDocument({
      sportProfile: sportProfileForVariant(next),
    });
    replaceDocument({
      ...freshDoc,
      layers: {
        ...freshDoc.layers,
        players: defaultPlayersForVariant(next),
      },
    });
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
          "offense",
          ids[0],
        );
      } else {
        const multi = await saveFormationInPlaybooksAction(
          trimmed,
          doc.layers.players,
          doc.sportProfile,
          losY,
          "offense",
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

  const VIEWPORT_LENGTH_YDS = 25;
  const fieldAspect =
    doc.sportProfile.fieldWidthYds / (VIEWPORT_LENGTH_YDS * 0.75);

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
    <div className="flex flex-col gap-5">
      {isPreview && <ExamplePreviewBanner />}
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" leftIcon={ArrowLeft}>
            {backLabel}
          </Button>
        </Link>
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
            /* Can't change sport on existing formation — would lose player layout */
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Formation name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trips Right"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
      </div>

      {/* Editor area */}
      <div className="grid min-h-0 gap-5 lg:grid-cols-[1fr_280px]">
        {/* Canvas */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-muted">
            <MousePointer className="size-4 shrink-0" />
            <span>
              Drag players to reposition. Click a player to edit its label,
              role, and style.
            </span>
          </div>
          {/* Fixed 8:5 canvas — sport type changes field proportions inside
              but never resizes this box. Green bg hides any letterboxing. */}
          <div
            className="relative w-full overflow-hidden rounded-xl bg-[#2D8B4E]"
            style={{ aspectRatio: "8 / 5" }}
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
