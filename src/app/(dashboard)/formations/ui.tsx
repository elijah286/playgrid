"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy, Pencil, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  addFormationToSeedsAction,
  deleteFormationAction,
  duplicateFormationAction,
  type SavedFormation,
} from "@/app/actions/formations";
import {
  CopyToPlaybookDialog,
  type CopyTarget,
} from "@/features/playbooks/CopyToPlaybookDialog";
import {
  ActionMenu,
  Button,
  Card,
  EmptyState,
  SegmentedControl,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { PlayType, SportVariant } from "@/domain/play/types";
import type { FormationKind } from "@/app/actions/formations";
import { NewFormationPlaybookPicker } from "./NewFormationPlaybookPicker";

type SportFilter = "all" | SportVariant;
type KindFilter = "all" | FormationKind;

const FILTER_OPTIONS: { value: SportFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "flag_5v5", label: "Flag 5v5" },
  { value: "flag_7v7", label: "Flag 7v7" },
  { value: "other", label: "Other" },
  { value: "tackle_11", label: "11-Man" },
];

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "offense", label: "Offense" },
  { value: "defense", label: "Defense" },
  { value: "special_teams", label: "Special teams" },
];

const KIND_LABEL: Record<PlayType, string> = {
  offense: "Offense",
  defense: "Defense",
  special_teams: "Special teams",
};

function variantLabel(v: string) {
  return SPORT_VARIANT_LABELS[v as SportVariant] ?? v;
}

function FormationThumbnail({ formation }: { formation: SavedFormation }) {
  const R = 0.032;
  const PAD = R * 1.6;

  let minX = Infinity;
  let maxX = -Infinity;
  let minSvgY = Infinity;
  let maxSvgY = -Infinity;
  for (const p of formation.players) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    const sy = 1 - p.position.y;
    if (sy < minSvgY) minSvgY = sy;
    if (sy > maxSvgY) maxSvgY = sy;
  }
  if (!isFinite(minX)) {
    minX = 0; maxX = 1; minSvgY = 0.22; maxSvgY = 0.78;
  }

  const losY = 1 - 0.4;
  const fiveY = 1 - 0.6;
  const tenY = 1 - 0.8;
  minSvgY = Math.min(minSvgY, tenY);
  maxSvgY = Math.max(maxSvgY, losY);

  let vbX = Math.max(0, minX - PAD);
  let vbW = Math.min(1, maxX + PAD) - vbX;
  let vbY = Math.max(0, minSvgY - PAD);
  let vbH = Math.min(1, maxSvgY + PAD) - vbY;

  const TARGET = 16 / 10;
  const currentAspect = vbW / vbH;
  if (currentAspect < TARGET) {
    const needed = vbH * TARGET;
    const extra = needed - vbW;
    vbX = Math.max(0, vbX - extra / 2);
    vbW = Math.min(1 - vbX, needed);
  } else if (currentAspect > TARGET) {
    const needed = vbW / TARGET;
    const extra = needed - vbH;
    vbY = Math.max(0, vbY - extra / 2);
    vbH = Math.min(1 - vbY, needed);
  }

  const aspect = vbW / vbH;
  const sxCorr = aspect / TARGET;

  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-surface-inset">
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <line
          x1={vbX} x2={vbX + vbW} y1={losY} y2={losY}
          stroke="rgba(100,116,139,0.45)" strokeWidth={1.25} vectorEffect="non-scaling-stroke"
        />
        <line
          x1={vbX} x2={vbX + vbW} y1={fiveY} y2={fiveY}
          stroke="rgba(100,116,139,0.3)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke"
        />
        <line
          x1={vbX} x2={vbX + vbW} y1={tenY} y2={tenY}
          stroke="rgba(100,116,139,0.3)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke"
        />
        {formation.players.map((p) => {
          const cx = p.position.x;
          const cy = 1 - p.position.y;
          return (
            <g key={p.id} transform={`translate(${cx} ${cy}) scale(${sxCorr} 1)`}>
              <circle
                cx={0} cy={0} r={R}
                fill={p.style.fill}
                stroke={p.style.stroke}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={0} y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={0.035}
                fontWeight={700}
                fill={p.style.labelColor}
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FormationCard({
  formation,
  isAdmin,
  onDelete,
  onDuplicate,
  onCopy,
  onUseAsSeed,
}: {
  formation: SavedFormation;
  isAdmin: boolean;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onCopy: (formation: SavedFormation) => void;
  onUseAsSeed: (id: string) => void;
}) {
  const router = useRouter();

  const items: ActionMenuItem[] = [
    {
      label: "Edit",
      icon: Pencil,
      onSelect: () => router.push(`/formations/${formation.id}/edit`),
    },
    { label: "Copy to playbook…", icon: Copy, onSelect: () => onCopy(formation) },
    { label: "Duplicate in this playbook", icon: Copy, onSelect: () => onDuplicate(formation.id) },
  ];
  if (isAdmin) {
    items.push({
      label: "Use as seed",
      icon: Sparkles,
      onSelect: () => onUseAsSeed(formation.id),
    });
  }
  items.push({
    label: "Delete",
    icon: Trash2,
    danger: true,
    onSelect: () => onDelete(formation.id, formation.displayName),
  });

  const handleOpen = () => router.push(`/formations/${formation.id}/edit`);

  const variantStr = formation.sportProfile?.variant
    ? variantLabel(formation.sportProfile.variant)
    : null;

  return (
    <Card hover className="relative flex flex-col p-0">
      <button
        type="button"
        onClick={handleOpen}
        className="flex flex-1 flex-col p-4 text-left"
      >
        <div className="flex items-start gap-1.5 pr-8">
          <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {formation.displayName}
          </h3>
        </div>

        <div className="mt-2">
          <FormationThumbnail formation={formation} />
        </div>

        <p className="mt-2 truncate text-xs text-muted">
          {[
            KIND_LABEL[formation.kind ?? "offense"],
            variantStr,
            `${formation.players.length} players`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {formation.playbookName && (
          <p className="mt-0.5 truncate text-[11px] text-muted/80">
            in {formation.playbookName}
          </p>
        )}
      </button>

      <div className="absolute right-2 top-2">
        <ActionMenu items={items} />
      </div>
    </Card>
  );
}

const VARIANT_ORDER: SportVariant[] = [
  "flag_5v5",
  "flag_7v7",
  "other",
  "tackle_11",
];

export function FormationsClient({
  initial,
  isAdmin = false,
}: {
  initial: SavedFormation[];
  isAdmin?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [formations, setFormations] = useState(initial);
  const [filter, setFilter] = useState<SportFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleDelete(id: string, displayName: string) {
    if (!window.confirm(`Delete "${displayName}"? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteFormationAction(id);
      if (res.ok) {
        setFormations((prev) => prev.filter((f) => f.id !== id));
        toast(`"${displayName}" deleted.`, "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const res = await duplicateFormationAction(id);
      if (res.ok) {
        toast("Formation duplicated", "success");
        router.push(`/formations/${res.formationId}/edit`);
      } else {
        toast(res.error, "error");
      }
    });
  }

  function handleCopy(formation: SavedFormation) {
    setCopyTarget({
      kind: "formation",
      formationId: formation.id,
      formationName: formation.displayName,
    });
  }

  function handleUseAsSeed(id: string) {
    startTransition(async () => {
      const res = await addFormationToSeedsAction(id);
      if (res.ok) {
        toast("Added to seed formations", "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

  const kindVisible =
    kindFilter === "all"
      ? formations
      : formations.filter((f) => (f.kind ?? "offense") === kindFilter);

  const visible =
    filter === "all"
      ? kindVisible
      : kindVisible.filter(
          (f) => (f.sportProfile?.variant ?? "flag_7v7") === filter,
        );

  const groups = useMemo(() => {
    const groupsToShow: SportVariant[] =
      filter === "all" ? VARIANT_ORDER : [filter as SportVariant];
    return groupsToShow.map((variant) => ({
      variant,
      label: SPORT_VARIANT_LABELS[variant].toUpperCase(),
      formations: visible
        .filter((f) => (f.sportProfile?.variant ?? "flag_7v7") === variant)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }));
  }, [filter, visible]);

  const ungrouped =
    filter === "all" ? visible.filter((f) => !f.sportProfile?.variant) : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={kindFilter}
          onChange={(v) => setKindFilter(v as KindFilter)}
          options={KIND_OPTIONS}
        />
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(v as SportFilter)}
          options={FILTER_OPTIONS}
        />
        <div className="ml-auto">
          <Button variant="primary" size="sm" leftIcon={Plus} onClick={() => setPickerOpen(true)}>
            New formation
          </Button>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.variant}>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {group.label}
          </h2>
          {group.formations.length === 0 ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="block w-full rounded-xl border border-dashed border-border bg-surface-raised/60 px-4 py-5 text-center text-sm text-muted transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground"
            >
              No formations — click here to create one
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {group.formations.map((f) => (
                <FormationCard
                  key={f.id}
                  formation={f}
                  isAdmin={isAdmin}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onCopy={handleCopy}
                  onUseAsSeed={handleUseAsSeed}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Custom
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {ungrouped.map((f) => (
              <FormationCard
                key={f.id}
                formation={f}
                isAdmin={isAdmin}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onCopy={handleCopy}
                onUseAsSeed={handleUseAsSeed}
              />
            ))}
          </div>
        </section>
      )}

      {formations.length === 0 && (
        <EmptyState
          icon={Users}
          heading="No formations yet"
          description="Create a playbook to get the seed formations, or add your own."
          action={
            <Button variant="primary" leftIcon={Plus} onClick={() => setPickerOpen(true)}>
              New formation
            </Button>
          }
        />
      )}

      {copyTarget && (
        <CopyToPlaybookDialog
          open={!!copyTarget}
          onClose={() => setCopyTarget(null)}
          currentPlaybookId={""}
          target={copyTarget}
          toast={toast}
          onCopied={(result) => {
            if (result.formationId) {
              router.push(`/formations/${result.formationId}/edit`);
            } else {
              router.push(`/playbooks/${result.playbookId}?tab=formations`);
            }
          }}
        />
      )}

      {pickerOpen && (
        <NewFormationPlaybookPicker
          onClose={() => setPickerOpen(false)}
          onPick={(playbookId, variant) => {
            setPickerOpen(false);
            const q = new URLSearchParams({ variant, returnToPlaybook: playbookId });
            router.push(`/formations/new?${q.toString()}`);
          }}
        />
      )}
    </div>
  );
}

export { FormationThumbnail };
