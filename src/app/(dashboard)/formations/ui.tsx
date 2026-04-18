"use client";

import { useState, useTransition } from "react";
import { BookOpen, Pencil, Trash2, Users } from "lucide-react";
import Link from "next/link";
import {
  deleteFormationAction,
  renameFormationAction,
  type SavedFormation,
} from "@/app/actions/formations";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  useToast,
} from "@/components/ui";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

function variantLabel(v: string) {
  return SPORT_VARIANT_LABELS[v as SportVariant] ?? v;
}

/** Tiny SVG preview of a formation — draws circles at normalized positions. */
function FormationPreview({ formation }: { formation: SavedFormation }) {
  const sp = formation.sportProfile;
  const fieldW = (sp.fieldWidthYds ?? 30);
  const fieldL = (sp.fieldLengthYds ?? 40);
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
            <circle cx={cx} cy={cy} r={r} fill={p.style.fill} stroke={p.style.stroke} strokeWidth={0.8} />
            <text
              x={cx}
              y={cy + 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={4.5}
              fill={p.style.labelColor}
              fontWeight="700"
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
  onRename,
  onDelete,
  pending,
}: {
  formation: SavedFormation;
  onRename: (id: string, current: string) => void;
  onDelete: (id: string, name: string) => void;
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
          {!formation.isSystem && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={Pencil}
                loading={pending}
                onClick={() => onRename(formation.id, formation.displayName)}
              >
                Rename
              </Button>
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
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

type GroupedFormations = {
  variant: SportVariant;
  label: string;
  formations: SavedFormation[];
};

export function FormationsClient({
  initial,
}: {
  initial: SavedFormation[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [formations, setFormations] = useState(initial);

  function handleRename(id: string, current: string) {
    const next = window.prompt("Rename formation", current);
    if (!next || next.trim() === current) return;
    startTransition(async () => {
      const res = await renameFormationAction(id, next.trim());
      if (res.ok) {
        setFormations((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, displayName: next.trim() } : f,
          ),
        );
        toast("Renamed", "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

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

  const VARIANT_ORDER: SportVariant[] = ["flag_5v5", "flag_7v7", "six_man", "tackle_11"];
  const groups: GroupedFormations[] = VARIANT_ORDER.map((variant) => ({
    variant,
    label: SPORT_VARIANT_LABELS[variant],
    formations: formations.filter(
      (f) => (f.sportProfile?.variant ?? "flag_7v7") === variant,
    ),
  })).filter((g) => g.formations.length > 0);

  const ungrouped = formations.filter((f) => !f.sportProfile?.variant);

  return (
    <div className="space-y-10">
      {/* How to create custom formations */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised p-4">
        <BookOpen className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">Creating custom formations</p>
          <p className="mt-1 text-muted">
            Open any play, switch to the{" "}
            <span className="font-medium text-foreground">Formation</span> tab, arrange
            your players, then click{" "}
            <span className="font-medium text-foreground">Save formation</span>. It will
            appear here and be available in every playbook.
          </p>
          <Link href="/playbooks" className="mt-2 inline-block text-primary hover:underline">
            Go to Playbooks →
          </Link>
        </div>
      </div>

      {formations.length === 0 && (
        <EmptyState
          icon={Users}
          heading="No formations yet"
          description="System formations appear once migration 0009 has been applied to your database. Custom formations are saved from the play editor's Formation tab."
        />
      )}

      {groups.map((group) => (
        <section key={group.variant}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.formations
              .sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1))
              .map((f) => (
                <FormationCard
                  key={f.id}
                  formation={f}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  pending={pending}
                />
              ))}
          </div>
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
                onRename={handleRename}
                onDelete={handleDelete}
                pending={pending}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
