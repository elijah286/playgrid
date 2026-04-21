"use client";

import { Trash2 } from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument, RouteStyle } from "@/domain/play/types";
import { evaluateSportWarnings } from "@/domain/play/warnings";
import { Select, Button } from "@/components/ui";
import { QuickRoutes } from "./QuickRoutes";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  selectedPlayerId: string | null;
  selectedRouteId: string | null;
  selectedSegmentId: string | null;
  activeStyle?: Partial<RouteStyle>;
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
}: Props) {
  const warnings = evaluateSportWarnings(doc);
  const route = doc.layers.routes.find((r) => r.id === selectedRouteId);
  const player = doc.layers.players.find((p) => p.id === selectedPlayerId);

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

      {/* Quick routes: hidden on defensive plays — those just draw direction arrows. */}
      {player && !route && doc.metadata.playType !== "defense" && (
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
/*  Formation tag picker                                               */
/* ------------------------------------------------------------------ */

export const FORMATION_TAG_PRESETS = [
  "Under Center", "Pistol", "Empty", "Trips", "Bunch",
  "Spread", "Open", "Heavy", "Tight", "Nub", "Motion", "Jet", "Shift",
];

