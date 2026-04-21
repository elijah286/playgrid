"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Copy, Link2Off, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  deleteFormationAction,
  duplicateFormationAction,
  setFormationPlaybookInclusionAction,
  type SavedFormation,
} from "@/app/actions/formations";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  useToast,
  type ActionMenuItem,
} from "@/components/ui";
import type { SportVariant } from "@/domain/play/types";

/**
 * Per-playbook formations tab. Mirrors the global formations page's card
 * layout but filtered to formations visible in this playbook (variant match,
 * minus exclusions). Coaches can remove a formation from this playbook
 * (leaves the global formation intact), or edit / duplicate / delete it from
 * the three-dot menu.
 */
export function PlaybookFormationsTab({
  playbookId,
  variant,
  initial,
}: {
  playbookId: string;
  variant: SportVariant;
  initial: SavedFormation[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [formations, setFormations] = useState(initial);
  const [q, setQ] = useState("");
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return formations;
    return formations.filter((f) => f.displayName.toLowerCase().includes(needle));
  }, [formations, q]);

  function handleRemoveFromPlaybook(id: string, name: string) {
    if (
      !window.confirm(
        `Remove "${name}" from this playbook? The formation stays in your global library.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await setFormationPlaybookInclusionAction(id, playbookId, false);
      if (res.ok) {
        setFormations((prev) => prev.filter((f) => f.id !== id));
        toast(`Removed "${name}" from this playbook.`, "success");
      } else {
        toast(res.error, "error");
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (
      !window.confirm(`Delete "${name}" globally? This can't be undone.`)
    )
      return;
    startTransition(async () => {
      const res = await deleteFormationAction(id);
      if (res.ok) {
        setFormations((prev) => prev.filter((f) => f.id !== id));
        toast(`"${name}" deleted.`, "success");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            leftIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search formations…"
          />
        </div>
        <Link
          href={`/formations/new?variant=${variant}&returnToPlaybook=${playbookId}`}
          className="hidden sm:inline-flex"
        >
          <Button variant="primary" leftIcon={Plus}>
            New formation
          </Button>
        </Link>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Plus}
          heading={q ? "No matches" : "No formations in this playbook"}
          description={
            q
              ? "Try a different search term."
              : "Create one below, or add compatible formations from your global library."
          }
          action={
            !q ? (
              <Link href={`/formations/new?variant=${variant}&returnToPlaybook=${playbookId}`}>
                <Button variant="primary" leftIcon={Plus}>
                  New formation
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((f) => (
            <FormationCard
              key={f.id}
              formation={f}
              onEdit={() =>
                router.push(
                  `/formations/${f.id}/edit?returnToPlaybook=${playbookId}`,
                )
              }
              onDuplicate={handleDuplicate}
              onRemoveFromPlaybook={handleRemoveFromPlaybook}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FormationCard({
  formation,
  onEdit,
  onDuplicate,
  onRemoveFromPlaybook,
  onDelete,
}: {
  formation: SavedFormation;
  onEdit: () => void;
  onDuplicate: (id: string) => void;
  onRemoveFromPlaybook: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const items: ActionMenuItem[] = [
    { label: "Edit", icon: Pencil, onSelect: onEdit, disabled: formation.isSystem },
    { label: "Duplicate", icon: Copy, onSelect: () => onDuplicate(formation.id) },
    {
      label: "Remove from playbook",
      icon: Link2Off,
      onSelect: () => onRemoveFromPlaybook(formation.id, formation.displayName),
    },
  ];
  if (!formation.isSystem) {
    items.push({
      label: "Delete globally",
      icon: Trash2,
      danger: true,
      onSelect: () => onDelete(formation.id, formation.displayName),
    });
  }

  return (
    <Card hover className="relative flex flex-col p-0">
      <button
        type="button"
        onClick={onEdit}
        className="flex flex-1 flex-col p-4 text-left"
        disabled={formation.isSystem}
      >
        <div className="flex items-start gap-1.5 pr-8">
          <h3 className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {formation.displayName}
          </h3>
          {formation.isSystem && (
            <Badge variant="default" className="shrink-0">System</Badge>
          )}
        </div>

        <div className="mt-2">
          <FormationThumbnail formation={formation} />
        </div>

        <p className="mt-2 truncate text-xs text-muted">
          {formation.players.length} players
        </p>
      </button>

      <div className="absolute right-2 top-2">
        <ActionMenu items={items} />
      </div>
    </Card>
  );
}

export function FormationThumbnail({ formation }: { formation: SavedFormation }) {
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
    minX = 0;
    maxX = 1;
    minSvgY = 0.22;
    maxSvgY = 0.78;
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
          x1={vbX}
          x2={vbX + vbW}
          y1={losY}
          y2={losY}
          stroke="rgba(100,116,139,0.45)"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={vbX}
          x2={vbX + vbW}
          y1={fiveY}
          y2={fiveY}
          stroke="rgba(100,116,139,0.3)"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={vbX}
          x2={vbX + vbW}
          y1={tenY}
          y2={tenY}
          stroke="rgba(100,116,139,0.3)"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />

        {formation.players.map((p) => {
          const cx = p.position.x;
          const cy = 1 - p.position.y;
          return (
            <g key={p.id} transform={`translate(${cx} ${cy}) scale(${sxCorr} 1)`}>
              <circle
                cx={0}
                cy={0}
                r={R}
                fill={p.style.fill}
                stroke={p.style.stroke}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={0}
                y={0}
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
