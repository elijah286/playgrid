"use client";

import { useState } from "react";
import { AlertTriangle, Link2Off, PlusCircle, Tag, Trash2 } from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument, RouteStyle } from "@/domain/play/types";
import { evaluateSportWarnings } from "@/domain/play/warnings";
import { Select, Badge, Button } from "@/components/ui";
import { QuickRoutes } from "./QuickRoutes";
import type { SavedFormation } from "@/app/actions/formations";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  selectedPlayerId: string | null;
  selectedRouteId: string | null;
  selectedSegmentId: string | null;
  activeStyle?: Partial<RouteStyle>;
  linkedFormation?: SavedFormation | null;
};

const routeOptions = [
  { value: "", label: "Custom / unset" },
  { value: "slant", label: "Slant" },
  { value: "go", label: "Go" },
  { value: "post", label: "Post" },
  { value: "corner", label: "Corner" },
  { value: "in", label: "In" },
  { value: "out", label: "Out" },
];

export function Inspector({
  doc,
  dispatch,
  selectedPlayerId,
  selectedRouteId,
  selectedSegmentId,
  activeStyle,
  linkedFormation,
}: Props) {
  const warnings = evaluateSportWarnings(doc);
  const route = doc.layers.routes.find((r) => r.id === selectedRouteId);
  const player = doc.layers.players.find((p) => p.id === selectedPlayerId);

  // Formation drift detection — threshold is 0.08 (~2 yards in 25-yd field)
  const DRIFT_THRESHOLD = 0.08;
  const formationId = doc.metadata.formationId;
  const formationTag = doc.metadata.formationTag;
  const formationName = doc.metadata.formation;

  const hasDrift = !!formationId && !!linkedFormation && (() => {
    const fpMap = new Map(linkedFormation.players.map((p) => [p.id, p.position]));
    return doc.layers.players.some((p) => {
      const fp = fpMap.get(p.id);
      if (!fp) return false;
      return Math.hypot(p.position.x - fp.x, p.position.y - fp.y) > DRIFT_THRESHOLD;
    });
  })();

  return (
    <div className="space-y-5 text-sm">
      {warnings.length > 0 && (
        <section className="rounded-lg bg-warning-light px-3 py-2.5 ring-1 ring-warning/20">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">Rules</p>
          <ul className="mt-1.5 list-disc pl-4 text-xs text-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Formation link indicator / drift banner */}
      {formationId && (
        <section className={`rounded-lg px-3 py-2.5 ring-1 ${
          hasDrift && !formationTag
            ? "bg-warning-light ring-warning/20"
            : "bg-surface-inset ring-border"
        }`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${hasDrift && !formationTag ? "text-warning" : "text-muted"}`}>
              {hasDrift && !formationTag ? "⚠ Formation drifted" : "Formation"}
            </p>
            <button
              type="button"
              title="Unlink formation"
              onClick={() => dispatch({ type: "document.setFormationLink", formationId: null, formationName: "" })}
              className="text-muted hover:text-foreground"
            >
              <Link2Off className="size-3.5" />
            </button>
          </div>
          <p className="mt-0.5 text-xs font-medium text-foreground">
            {formationName || "Linked formation"}
            {formationTag && <span className="ml-1.5 text-xs text-muted">— {formationTag}</span>}
          </p>

          {/* Drift actions */}
          {hasDrift && !formationTag && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* Keep — do nothing, just dismiss by adding empty tag sentinel */}
              <button
                type="button"
                className="rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface-inset"
                onClick={() => {/* no-op: user acknowledges but keeps link */}}
              >
                Keep link
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface-inset"
                onClick={() => {
                  dispatch({ type: "document.setFormationLink", formationId: null, formationName: formationName ?? "" });
                }}
              >
                Unlink
              </button>
            </div>
          )}

          {/* Formation tag picker */}
          <div className="mt-2">
            <FormationTagPicker
              value={formationTag ?? ""}
              onChange={(tag) => dispatch({ type: "document.setFormationTag", formationTag: tag || null })}
            />
          </div>
        </section>
      )}

      {/* No formation linked — show option to pick one */}
      {!formationId && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Formation</p>
          <p className="mt-1 text-xs text-muted">No formation linked</p>
        </section>
      )}

      {player && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Player
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="primary">{player.role}</Badge>
            <span className="font-semibold text-foreground">{player.label}</span>
          </div>

          {(() => {
            const playerRouteCount = doc.layers.routes.filter(
              (r) => r.carrierPlayerId === player.id,
            ).length;
            return playerRouteCount > 0 ? (
              <div className="mt-2 text-xs text-muted">
                {playerRouteCount} route{playerRouteCount !== 1 ? "s" : ""}
              </div>
            ) : null;
          })()}
        </section>
      )}

      {/* Quick routes: shown when a player is selected and no route is being edited */}
      {player && !route && (
        <QuickRoutes player={player} dispatch={dispatch} activeStyle={activeStyle} />
      )}

      {route && (
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Route
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{route.nodes.length} nodes</span>
            <span className="text-border">&middot;</span>
            <span>{route.segments.length} segments</span>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-foreground">Semantic family</span>
            <Select
              options={routeOptions}
              value={route.semantic?.family ?? ""}
              onChange={(v) => {
                dispatch({
                  type: "route.setSemantic",
                  routeId: route.id,
                  semantic: v
                    ? {
                        family: v as import("@/domain/play/types").RouteSemantic["family"],
                      }
                    : null,
                });
              }}
            />
          </div>
          <Button
            variant="danger"
            size="sm"
            leftIcon={Trash2}
            className="w-full"
            onClick={() => dispatch({ type: "route.remove", routeId: route.id })}
          >
            Delete route
          </Button>
        </section>
      )}
    </div>
  );
}

const FORMATION_TAG_PRESETS = [
  "Under Center", "Pistol", "Empty", "Trips", "Bunch",
  "Spread", "Open", "Heavy", "Tight", "Nub", "Motion", "Jet", "Shift",
];

function FormationTagPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (tag: string) => void;
}) {
  const [custom, setCustom] = useState(
    value && !FORMATION_TAG_PRESETS.includes(value) ? value : "",
  );

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted">Add a tag for this variation</p>
      <div className="flex flex-wrap gap-1">
        {FORMATION_TAG_PRESETS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onChange(value === tag ? "" : tag)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              value === tag
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border bg-surface-inset text-muted hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Custom tag…"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onBlur={() => { if (custom.trim()) onChange(custom.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter" && custom.trim()) onChange(custom.trim()); }}
        className="w-full rounded-md border border-border bg-surface-inset px-2 py-1 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
