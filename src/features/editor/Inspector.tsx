"use client";

import { useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Link2Off, RefreshCcw, Trash2 } from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument, RouteStyle } from "@/domain/play/types";
import { evaluateSportWarnings } from "@/domain/play/warnings";
import { Select, Badge, Button } from "@/components/ui";
import { QuickRoutes } from "./QuickRoutes";
import { listFormationsAction, type SavedFormation } from "@/app/actions/formations";

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

  const formationId = doc.metadata.formationId;
  const formationTag = doc.metadata.formationTag;
  const formationName = doc.metadata.formation;

  // Drift detection — compare in yards-from-LOS space so changes to
  // lineOfScrimmageY / fieldLengthYds (yard spinners) or legacy LOS migrations
  // don't produce false positives.
  const DRIFT_THRESHOLD_YDS = 2; // 2 yards in any direction
  const playLosY = typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
  const playFieldLen = doc.sportProfile.fieldLengthYds; // total yards in play window
  const playFieldW = doc.sportProfile.fieldWidthYds;

  const hasDrift =
    !!formationId &&
    !!linkedFormation &&
    (() => {
      const formLosY = linkedFormation.losY ?? 0.4;
      const FORM_FIELD_LEN = 25; // standard window for all stored formations
      const fpMap = new Map(linkedFormation.players.map((p) => [p.id, p.position]));
      return doc.layers.players.some((p) => {
        const fp = fpMap.get(p.id);
        if (!fp) return false;
        // Convert both to yards from LOS
        const playYds = (p.position.y - playLosY) * playFieldLen;
        const formYds = (fp.y - formLosY) * FORM_FIELD_LEN;
        const dyYds = playYds - formYds;
        const dxYds = (p.position.x - fp.x) * playFieldW;
        return Math.hypot(dxYds, dyYds) > DRIFT_THRESHOLD_YDS;
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

      {/* Formation section — always visible */}
      <FormationSection
        formationId={formationId ?? null}
        formationName={formationName ?? ""}
        linkedFormation={linkedFormation ?? null}
        hasDrift={hasDrift}
        dispatch={dispatch}
      />

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

/* ------------------------------------------------------------------ */
/*  Formation section                                                  */
/* ------------------------------------------------------------------ */

function FormationSection({
  formationId,
  formationName,
  linkedFormation,
  hasDrift,
  dispatch,
}: {
  formationId: string | null;
  formationName: string;
  linkedFormation: SavedFormation | null;
  hasDrift: boolean;
  dispatch: (c: PlayCommand) => void;
}) {
  return (
    <section className="rounded-lg bg-surface-inset px-3 py-2.5 ring-1 ring-border">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Formation
          {hasDrift && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
              drifted
            </span>
          )}
        </p>
      </div>

      {/* Formation name + actions row */}
      <div className="mt-1 flex items-center gap-1.5">
        <FormationChangePicker
          formationId={formationId}
          formationName={formationName}
          dispatch={dispatch}
        />

        {formationId && linkedFormation && (
          <button
            type="button"
            title="Reapply formation (snap players back)"
            onClick={() =>
              dispatch({
                type: "document.reapplyFormation",
                players: linkedFormation.players,
                formationLosY: linkedFormation.losY,
              })
            }
            className="flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <RefreshCcw className="size-3" />
            Reapply
          </button>
        )}

        {formationId && (
          <button
            type="button"
            title="Unlink formation"
            onClick={() =>
              dispatch({ type: "document.setFormationLink", formationId: null, formationName: "" })
            }
            className="ml-auto flex size-6 items-center justify-center rounded text-muted hover:text-foreground"
          >
            <Link2Off className="size-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Formation change picker (lazy-loaded dropdown)                     */
/* ------------------------------------------------------------------ */

function FormationChangePicker({
  formationId,
  formationName,
  dispatch,
}: {
  formationId: string | null;
  formationName: string;
  dispatch: (c: PlayCommand) => void;
}) {
  const [open, setOpen] = useState(false);
  const [formations, setFormations] = useState<SavedFormation[] | null>(null);
  const [, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openPicker = () => {
    setOpen((prev) => !prev);
    if (!formations) {
      startTransition(async () => {
        const res = await listFormationsAction();
        if (res.ok) setFormations(res.formations);
      });
    }
  };

  const select = (f: SavedFormation | null) => {
    if (!f) {
      dispatch({ type: "document.setFormationLink", formationId: null, formationName: "" });
    } else {
      dispatch({
        type: "document.setFormationLink",
        formationId: f.id,
        formationName: f.displayName,
        players: f.players,
        formationLosY: f.losY,
      });
    }
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="flex max-w-full items-center gap-1 truncate text-xs font-medium text-foreground hover:text-primary"
      >
        <span className="truncate">
          {formationName || "No formation"}
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-surface-raised shadow-lg">
            {formations === null ? (
              <p className="px-3 py-2 text-xs text-muted">Loading…</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto py-1">
                {/* No formation option */}
                <li>
                  <button
                    type="button"
                    onClick={() => select(null)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-inset ${
                      !formationId ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {!formationId && <Check className="size-3 shrink-0" />}
                    <span className={!formationId ? "ml-0" : "ml-5"}>No formation</span>
                  </button>
                </li>

                {formations.length > 0 && (
                  <li className="mx-2 my-1 border-t border-border" aria-hidden />
                )}

                {formations.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => select(f)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-inset ${
                        f.id === formationId ? "text-foreground" : "text-muted"
                      }`}
                    >
                      {f.id === formationId && <Check className="size-3 shrink-0" />}
                      <span className={f.id === formationId ? "ml-0" : "ml-5"}>
                        {f.displayName}
                      </span>
                    </button>
                  </li>
                ))}

                {formations.length === 0 && (
                  <li className="px-3 py-1.5 text-xs text-muted">No formations saved yet</li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Formation tag picker                                               */
/* ------------------------------------------------------------------ */

export const FORMATION_TAG_PRESETS = [
  "Under Center", "Pistol", "Empty", "Trips", "Bunch",
  "Spread", "Open", "Heavy", "Tight", "Nub", "Motion", "Jet", "Shift",
];

