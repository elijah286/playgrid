"use client";

import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import { evaluateSportWarnings } from "@/domain/play/warnings";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  selectedPlayerId: string | null;
  selectedRouteId: string | null;
};

export function Inspector({ doc, dispatch, selectedPlayerId, selectedRouteId }: Props) {
  const warnings = evaluateSportWarnings(doc);
  const route = doc.layers.routes.find((r) => r.id === selectedRouteId);
  const player = doc.layers.players.find((p) => p.id === selectedPlayerId);

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Play naming
        </h3>
        <label className="mt-2 block">
          <span className="text-xs text-slate-500">Coach name</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={doc.metadata.coachName}
            onChange={(e) =>
              dispatch({ type: "document.setMetadata", patch: { coachName: e.target.value } })
            }
          />
        </label>
        <label className="mt-2 block">
          <span className="text-xs text-slate-500">Wristband code</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={doc.metadata.wristbandCode}
            onChange={(e) =>
              dispatch({ type: "document.setMetadata", patch: { wristbandCode: e.target.value } })
            }
          />
        </label>
      </section>

      {warnings.length > 0 && (
        <section className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200/80">
          <p className="text-xs font-semibold uppercase tracking-wide">Rules</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {player && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Player</h3>
          <p className="mt-1 font-medium">{player.label}</p>
          <p className="text-xs text-slate-500">{player.role}</p>
        </section>
      )}

      {route && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Route</h3>
          <label className="block">
            <span className="text-xs text-slate-500">Semantic family</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              value={route.semantic?.family ?? ""}
              onChange={(e) => {
                const v = e.target.value;
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
            >
              <option value="">Custom / unset</option>
              <option value="slant">Slant</option>
              <option value="go">Go</option>
              <option value="post">Post</option>
              <option value="corner">Corner</option>
              <option value="in">In</option>
              <option value="out">Out</option>
            </select>
          </label>
          <button
            type="button"
            className="w-full rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200/80"
            onClick={() => dispatch({ type: "route.remove", routeId: route.id })}
          >
            Delete route
          </button>
        </section>
      )}
    </div>
  );
}
