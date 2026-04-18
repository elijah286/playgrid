"use client";

import { useState, useTransition } from "react";
import { Trash2, Users } from "lucide-react";
import {
  deleteFormationAction,
  type SavedFormation,
} from "@/app/actions/formations";
import {
  Badge,
  Button,
  Card,
  EmptyState,
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

  // Preview box: 120 × (120/aspect) logical units, capped at 160 tall
  const W = 120;
  const H = Math.min(160, W / aspect);
  const r = 5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="rounded-lg border border-border bg-[#2D8B4E]"
    >
      {/* Field outline */}
      <rect x={0} y={0} width={W} height={H} fill="#2D8B4E" />
      {/* LOS at y=0.5 */}
      <line
        x1={0} y1={H * 0.5}
        x2={W} y2={H * 0.5}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1}
      />
      {/* Players */}
      {formation.players.map((p) => {
        const cx = p.position.x * W;
        const cy = (1 - p.position.y) * H; // y-flip
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

  // Group by sport variant, system first within each group
  const VARIANT_ORDER: SportVariant[] = ["flag_5v5", "flag_7v7", "six_man", "tackle_11"];
  const groups: GroupedFormations[] = VARIANT_ORDER.map((variant) => ({
    variant,
    label: SPORT_VARIANT_LABELS[variant],
    formations: formations.filter(
      (f) => (f.sportProfile?.variant ?? "flag_7v7") === variant,
    ),
  })).filter((g) => g.formations.length > 0);

  // Formations that have no sport variant in sportProfile fall under flag_7v7 by default
  const ungrouped = formations.filter(
    (f) => !f.sportProfile?.variant,
  );

  const allEmpty = formations.length === 0;

  return (
    <div className="space-y-10">
      {allEmpty && (
        <EmptyState
          icon={Users}
          heading="No formations yet"
          description="System formations appear here once your database migration has run. You can also save custom formations from the play editor."
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
                <Card key={f.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <FormationPreview formation={f} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="truncate font-semibold text-foreground text-sm">
                          {f.displayName}
                        </h3>
                        {f.isSystem && (
                          <Badge>System</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {f.players.length} players
                      </p>
                      {!f.isSystem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={Trash2}
                          className="mt-2 text-danger hover:text-danger"
                          loading={pending}
                          onClick={() => handleDelete(f.id, f.displayName)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </section>
      ))}

      {/* Ungrouped fallback (no sportProfile.variant set) */}
      {ungrouped.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
            Custom
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ungrouped.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start gap-3">
                  <FormationPreview formation={f} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-foreground text-sm">
                      {f.displayName}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      {f.players.length} players
                    </p>
                    {!f.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={Trash2}
                        className="mt-2 text-danger hover:text-danger"
                        loading={pending}
                        onClick={() => handleDelete(f.id, f.displayName)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
