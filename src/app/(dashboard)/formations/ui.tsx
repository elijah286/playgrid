"use client";

import { useState, useTransition } from "react";
import { Copy, Pencil, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteFormationAction,
  duplicateFormationAction,
  type SavedFormation,
} from "@/app/actions/formations";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SegmentedControl,
  useToast,
} from "@/components/ui";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

type SportFilter = "all" | SportVariant;

const FILTER_OPTIONS: { value: SportFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "flag_5v5", label: "Flag 5v5" },
  { value: "flag_7v7", label: "Flag 7v7" },
  { value: "six_man", label: "6-Man" },
  { value: "tackle_11", label: "11-Man" },
];

function variantLabel(v: string) {
  return SPORT_VARIANT_LABELS[v as SportVariant] ?? v;
}

/** Tiny SVG field preview of a formation. */
function FormationPreview({ formation }: { formation: SavedFormation }) {
  const sp = formation.sportProfile;
  const fieldW = sp.fieldWidthYds ?? 30;
  const fieldL = sp.fieldLengthYds ?? 40;
  const aspect = fieldW / fieldL;

  const W = 120;
  const H = Math.min(160, W / aspect);
  const r = 5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="shrink-0 rounded-lg border border-border bg-[#2D8B4E]"
    >
      <rect x={0} y={0} width={W} height={H} fill="#2D8B4E" />
      <line
        x1={0} y1={H * 0.5}
        x2={W} y2={H * 0.5}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1}
      />
      {formation.players.map((p) => {
        const cx = p.position.x * W;
        const cy = (1 - p.position.y) * H;
        return (
          <g key={p.id}>
            <circle
              cx={cx} cy={cy} r={r}
              fill={p.style.fill} stroke={p.style.stroke} strokeWidth={0.8}
            />
            <text
              x={cx} y={cy + 0.5}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={4.5} fill={p.style.labelColor} fontWeight="700"
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function FormationCard({
  formation,
  onDelete,
  onDuplicate,
  pending,
}: {
  formation: SavedFormation;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  pending: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <FormationPreview formation={formation} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-semibold text-foreground text-sm">
              {formation.displayName}
            </h3>
            {formation.isSystem && <Badge>System</Badge>}
          </div>
          {formation.sportProfile?.variant && (
            <p className="mt-0.5 text-[11px] text-muted">
              {variantLabel(formation.sportProfile.variant)}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {formation.players.length} players
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {!formation.isSystem && (
              <Link href={`/formations/${formation.id}/edit`}>
                <Button variant="ghost" size="sm" leftIcon={Pencil}>
                  Edit
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              leftIcon={Copy}
              loading={pending}
              onClick={() => onDuplicate(formation.id)}
            >
              Duplicate
            </Button>
            {!formation.isSystem && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={Trash2}
                className="text-danger hover:text-danger"
                loading={pending}
                onClick={() => onDelete(formation.id, formation.displayName)}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

const VARIANT_ORDER: SportVariant[] = [
  "flag_5v5",
  "flag_7v7",
  "six_man",
  "tackle_11",
];

export function FormationsClient({ initial }: { initial: SavedFormation[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formations, setFormations] = useState(initial);
  const [filter, setFilter] = useState<SportFilter>("all");

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

  // Apply sport filter
  const visible =
    filter === "all"
      ? formations
      : formations.filter(
          (f) => (f.sportProfile?.variant ?? "flag_7v7") === filter,
        );

  const groupsToShow: SportVariant[] =
    filter === "all" ? VARIANT_ORDER : [filter as SportVariant];

  const groups = groupsToShow.map((variant) => ({
    variant,
    label: SPORT_VARIANT_LABELS[variant],
    formations: visible
      .filter((f) => (f.sportProfile?.variant ?? "flag_7v7") === variant)
      .sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1)),
  }));

  const ungrouped =
    filter === "all" ? visible.filter((f) => !f.sportProfile?.variant) : [];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
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
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.formations.map((f) => (
                <FormationCard
                  key={f.id}
                  formation={f}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  pending={pending}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
            Custom
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ungrouped.map((f) => (
              <FormationCard
                key={f.id}
                formation={f}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                pending={pending}
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
