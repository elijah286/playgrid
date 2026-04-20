"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, MousePointer } from "lucide-react";
import Link from "next/link";
import { saveFormationAction, updateFormationAction } from "@/app/actions/formations";
import {
  Button,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import { EditorCanvas } from "@/features/editor/EditorCanvas";
import { FormationInspector } from "@/features/editor/FormationInspector";
import { usePlayEditor } from "@/features/editor/usePlayEditor";
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
    }
  | {
      mode: "edit";
      formationId: string;
      initialName: string;
      initialVariant: SportVariant;
      initialPlayers: Player[];
    };

export function FormationEditorClient(props: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

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
      res = await saveFormationAction(trimmed, doc.layers.players, doc.sportProfile, losY);
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
    // If we came from "create new formation" in a playbook context, return to
    // that play's editor; otherwise go to the formations list.
    const returnTo =
      props.mode === "new" && props.returnToPlay
        ? `/plays/${props.returnToPlay}/edit`
        : "/formations";
    router.push(returnTo);
  }

  const fieldAspect =
    doc.sportProfile.fieldWidthYds / (doc.sportProfile.fieldLengthYds * 0.75);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <Link href="/formations">
          <Button variant="ghost" size="sm" leftIcon={ArrowLeft}>
            Formations
          </Button>
        </Link>
        <h1 className="text-lg font-bold text-foreground">
          {props.mode === "edit" ? "Edit formation" : "New formation"}
        </h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
