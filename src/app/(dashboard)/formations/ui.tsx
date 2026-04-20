"use client";

import { useEffect, useState, useTransition } from "react";
import { BookOpen, Copy, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteFormationAction,
  duplicateFormationAction,
  listCompatiblePlaybooksForFormationAction,
  setFormationPlaybookInclusionAction,
  type SavedFormation,
} from "@/app/actions/formations";
import {
  ActionMenu,
  Badge,
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

/**
 * Formation thumbnail — same visual language as PlayPreview in playbooks/ui.tsx:
 * 16:10 aspect-ratio container, bg-surface-inset, LOS + yard-guide lines,
 * players rendered in normalized field coords with counter-scaling for circles.
 */
function FormationThumbnail({ formation }: { formation: SavedFormation }) {
  const R = 0.032;
  const PAD = R * 1.6;

  // Compute bounding box over all player positions (SVG y-down: sy = 1 - y).
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

  // Always include LOS and 10-yd downfield guide in the frame.
  const losY = 1 - 0.4;        // SVG-y of line of scrimmage (default y=0.4)
  const fiveY = 1 - 0.6;       // 5 yds downfield
  const tenY = 1 - 0.8;        // 10 yds downfield
  minSvgY = Math.min(minSvgY, tenY);
  maxSvgY = Math.max(maxSvgY, losY);

  let vbX = Math.max(0, minX - PAD);
  let vbW = Math.min(1, maxX + PAD) - vbX;
  let vbY = Math.max(0, minSvgY - PAD);
  let vbH = Math.min(1, maxSvgY + PAD) - vbY;

  // Pad to 16:10 so all thumbnails share the same aspect.
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
  // Counter-scale x so circles stay round under preserveAspectRatio="none".
  const sxCorr = aspect / TARGET;

  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-surface-inset">
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        {/* Yard guides */}
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

        {/* Players */}
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
  onDelete,
  onDuplicate,
}: {
  formation: SavedFormation;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const router = useRouter();
  const [playbookMenuOpen, setPlaybookMenuOpen] = useState(false);

  const items: ActionMenuItem[] = [
    {
      label: "Available in playbooks…",
      icon: BookOpen,
      onSelect: () => setPlaybookMenuOpen(true),
    },
    {
      label: "Duplicate",
      icon: Copy,
      onSelect: () => onDuplicate(formation.id),
    },
  ];
  if (!formation.isSystem) {
    items.push({
      label: "Delete",
      icon: Trash2,
      danger: true,
      onSelect: () => onDelete(formation.id, formation.displayName),
    });
  }

  const handleOpen = () => {
    if (formation.isSystem) onDuplicate(formation.id);
    else router.push(`/formations/${formation.id}/edit`);
  };

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
        {/* Title row */}
        <div className="flex items-start gap-1.5 pr-8">
          <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {formation.displayName}
          </h3>
          {formation.isSystem && (
            <Badge variant="default" className="shrink-0">System</Badge>
          )}
        </div>

        {/* Thumbnail */}
        <div className="mt-2">
          <FormationThumbnail formation={formation} />
        </div>

        {/* Metadata */}
        <p className="mt-2 truncate text-xs text-muted">
          {[
            KIND_LABEL[formation.kind ?? "offense"],
            variantStr,
            `${formation.players.length} players`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </button>

      {/* Action menu */}
      <div className="absolute right-2 top-2">
        <ActionMenu items={items} />
      </div>

      {playbookMenuOpen && (
        <AvailableInPlaybooksDialog
          formationId={formation.id}
          formationName={formation.displayName}
          onClose={() => setPlaybookMenuOpen(false)}
        />
      )}
    </Card>
  );
}

function AvailableInPlaybooksDialog({
  formationId,
  formationName,
  onClose,
}: {
  formationId: string;
  formationName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<
    Array<{ id: string; name: string; excluded: boolean }>
  >([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listCompatiblePlaybooksForFormationAction(formationId);
      if (cancelled) return;
      if (res.ok) {
        setRows(res.playbooks);
      } else {
        toast(res.error, "error");
        onClose();
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formationId]);

  function toggle(id: string, nextIncluded: boolean) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, excluded: !nextIncluded } : r)),
    );
    startTransition(async () => {
      const res = await setFormationPlaybookInclusionAction(
        formationId,
        id,
        nextIncluded,
      );
      if (!res.ok) {
        toast(res.error, "error");
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, excluded: nextIncluded } : r)),
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface-raised shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h3 className="truncate font-semibold text-foreground">
            Available in playbooks
          </h3>
          <p className="truncate text-xs text-muted">{formationName}</p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-xs text-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">
              No playbooks match this formation&apos;s sport type yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {rows.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm hover:bg-surface-inset">
                    <span className="truncate text-foreground">{r.name}</span>
                    <input
                      type="checkbox"
                      checked={!r.excluded}
                      onChange={(e) => toggle(r.id, e.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

const VARIANT_ORDER: SportVariant[] = [
  "flag_5v5",
  "flag_7v7",
  "other",
  "tackle_11",
];

export function FormationsClient({ initial }: { initial: SavedFormation[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [formations, setFormations] = useState(initial);
  const [filter, setFilter] = useState<SportFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

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

  const groupsToShow: SportVariant[] =
    filter === "all" ? VARIANT_ORDER : [filter as SportVariant];

  const groups = groupsToShow.map((variant) => ({
    variant,
    label: SPORT_VARIANT_LABELS[variant].toUpperCase(),
    formations: visible
      .filter((f) => (f.sportProfile?.variant ?? "flag_7v7") === variant)
      .sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1)),
  }));

  const ungrouped =
    filter === "all" ? visible.filter((f) => !f.sportProfile?.variant) : [];

  return (
    <div className="space-y-8">
      {/* Toolbar */}
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
          <Link href="/formations/new">
            <Button variant="primary" size="sm" leftIcon={Plus}>
              New formation
            </Button>
          </Link>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.variant}>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {group.label}
          </h2>
          {group.formations.length === 0 ? (
            <Link
              href={`/formations/new?variant=${group.variant}`}
              className="block rounded-xl border border-dashed border-border bg-surface-raised/60 px-4 py-5 text-center text-sm text-muted transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground"
            >
              No formations — click here to create one
            </Link>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {group.formations.map((f) => (
                <FormationCard
                  key={f.id}
                  formation={f}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
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
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        </section>
      )}

      {formations.length === 0 && (
        <EmptyState
          icon={Users}
          heading="No formations yet"
          description="Create a formation or apply migration 0009 to load the system formations."
          action={
            <Link href="/formations/new">
              <Button variant="primary" leftIcon={Plus}>
                New formation
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
