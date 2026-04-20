"use client";

import { Trash2 } from "lucide-react";
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

const PLAYER_FILL_COLORS = [
  "#FFFFFF",
  "#94A3B8",
  "#1C1C1E",
  "#F26522",
  "#3B82F6",
  "#EF4444",
  "#22C55E",
  "#FACC15",
];

const PLAYER_LABEL_COLORS = ["#FFFFFF", "#1C1C1E"];

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

          <div className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Fill color</span>
            <div className="flex flex-wrap gap-1.5">
              {PLAYER_FILL_COLORS.map((color) => {
                const active = player.style.fill === color;
                return (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    onClick={() =>
                      dispatch({
                        type: "player.setStyle",
                        playerId: player.id,
                        style: { ...player.style, fill: color },
                      })
                    }
                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      active ? "border-primary scale-110" : "border-border"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Label color</span>
            <div className="flex gap-2">
              {PLAYER_LABEL_COLORS.map((color) => {
                const active = player.style.labelColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    title={color === "#FFFFFF" ? "White" : "Black"}
                    onClick={() =>
                      dispatch({
                        type: "player.setStyle",
                        playerId: player.id,
                        style: { ...player.style, labelColor: color },
                      })
                    }
                    className={`flex h-7 flex-1 items-center justify-center rounded-md border-2 text-xs font-semibold transition-colors ${
                      active ? "border-primary" : "border-border"
                    }`}
                    style={{
                      backgroundColor: color,
                      color: color === "#FFFFFF" ? "#1C1C1E" : "#FFFFFF",
                    }}
                  >
                    Aa
                  </button>
                );
              })}
            </div>
          </div>
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

