"use client";

import { Button, Input, Select, Badge } from "@/components/ui";
import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument, PlayerRole, PlayerShape } from "@/domain/play/types";
import { deriveLabelColor } from "@/domain/play/labelColor";
import { PlayerShapeChip } from "./PlayerShape";
import { notifyTutorialAction } from "@/features/tutorials/engine/notify";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
  selectedPlayerId: string | null;
  onSelectPlayer: (id: string | null) => void;
};

const OFFENSE_ROLE_OPTIONS: { value: PlayerRole; label: string }[] = [
  { value: "QB", label: "QB" },
  { value: "RB", label: "RB" },
  { value: "WR", label: "WR" },
  { value: "TE", label: "TE" },
  { value: "C", label: "C" },
  { value: "OTHER", label: "Other" },
];

const DEFENSE_ROLE_OPTIONS: { value: PlayerRole; label: string }[] = [
  { value: "DL", label: "DL" },
  { value: "LB", label: "LB" },
  { value: "CB", label: "CB" },
  { value: "S", label: "S" },
  { value: "NB", label: "NB" },
  { value: "OTHER", label: "Other" },
];

/**
 * Which role list to offer, keyed off the DOCUMENT's side rather than the
 * selected player's current role.
 *
 * Reading it off the player makes "Other" a one-way trap: OTHER is in both
 * lists, so a defender relabelled to Other is no longer a defensive role,
 * the select flips to the offensive list, and there is no way back to CB.
 * The document knows the side unconditionally and can't be relabelled out
 * of it.
 */
function roleOptionsFor(doc: PlayDocument): { value: PlayerRole; label: string }[] {
  return (doc.metadata.playType ?? "offense") === "defense"
    ? DEFENSE_ROLE_OPTIONS
    : OFFENSE_ROLE_OPTIONS;
}

const FILL_COLORS = [
  "#FFFFFF",
  "#94A3B8",
  "#1C1C1E",
  "#F26522",
  "#3B82F6",
  "#EF4444",
  "#22C55E",
  "#FACC15",
  "#A855F7",
];

const LABEL_COLORS = ["#FFFFFF", "#1C1C1E"];

const SHAPES: { value: PlayerShape; icon: string; label: string }[] = [
  { value: "circle", icon: "○", label: "Circle" },
  { value: "square", icon: "□", label: "Square" },
  { value: "diamond", icon: "◇", label: "Diamond" },
  { value: "triangle", icon: "△", label: "Triangle" },
  { value: "star", icon: "★", label: "Star" },
];

export function FormationInspector({
  doc,
  dispatch,
  selectedPlayerId,
  onSelectPlayer,
}: Props) {
  const selectedPlayer = doc.layers.players.find((p) => p.id === selectedPlayerId) ?? null;

  if (selectedPlayer) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Player
          </span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => onSelectPlayer(null)}
          >
            All players
          </button>
        </div>

        {/* Label */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Label</label>
          <Input
            value={selectedPlayer.label}
            maxLength={3}
            onChange={(e) =>
              dispatch({
                type: "player.setLabel",
                playerId: selectedPlayer.id,
                label: e.target.value.slice(0, 3),
              })
            }
          />
        </div>

        {/* Role */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Role</label>
          <Select
            value={selectedPlayer.role}
            options={roleOptionsFor(doc)}
            onChange={(v) =>
              dispatch({
                type: "player.setRole",
                playerId: selectedPlayer.id,
                role: v as PlayerRole,
              })
            }
          />
        </div>

        {/* Shape */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Shape</label>
          <div className="flex gap-1">
            {SHAPES.map((s) => {
              const active = (selectedPlayer.shape ?? "circle") === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  title={s.label}
                  onClick={() =>
                    dispatch({
                      type: "player.setShape",
                      playerId: selectedPlayer.id,
                      shape: s.value,
                    })
                  }
                  className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-lg transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface-raised text-foreground hover:border-muted-light"
                  }`}
                >
                  {s.icon}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fill color */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Fill color</label>
          <div className="flex flex-wrap gap-1.5">
            {FILL_COLORS.map((color) => {
              const active = selectedPlayer.style.fill === color;
              return (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => {
                    dispatch({
                      type: "player.setStyle",
                      playerId: selectedPlayer.id,
                      style: { ...selectedPlayer.style, fill: color },
                    });
                    notifyTutorialAction("player-recolored");
                  }}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    active ? "border-primary scale-110" : "border-border"
                  }`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        </div>

        {/* Label color */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Label color</label>
          <div className="flex gap-2">
            {LABEL_COLORS.map((color) => {
              const active = selectedPlayer.style.labelColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  title={color === "#FFFFFF" ? "White" : "Black"}
                  onClick={() => {
                    dispatch({
                      type: "player.setStyle",
                      playerId: selectedPlayer.id,
                      style: { ...selectedPlayer.style, labelColor: color },
                    });
                    notifyTutorialAction("player-recolored");
                  }}
                  className={`flex h-9 flex-1 items-center justify-center rounded-lg border-2 text-xs font-semibold transition-colors ${
                    active ? "border-primary" : "border-border"
                  }`}
                  style={{ backgroundColor: color, color: color === "#FFFFFF" ? "#1C1C1E" : "#FFFFFF" }}
                >
                  Aa
                </button>
              );
            })}
          </div>
        </div>

        {/* Delete */}
        <div className="mt-2">
          <Button
            variant="danger"
            size="sm"
            className="w-full"
            onClick={() => {
              dispatch({ type: "player.remove", playerId: selectedPlayer.id });
              onSelectPlayer(null);
            }}
          >
            Delete player
          </Button>
        </div>
      </div>
    );
  }

  // No player selected — show list
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Players
      </span>
      {doc.layers.players.length === 0 && (
        <p className="text-xs text-muted">No players. Click the canvas to add one.</p>
      )}
      {doc.layers.players.map((pl) => (
        <button
          key={pl.id}
          type="button"
          onClick={() => onSelectPlayer(pl.id)}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface-inset px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5"
        >
          {/* Draw the player's actual shape, not a hardcoded circle. The
              canvas renders a defender as a triangle; a circle here put two
              different glyphs for the same player side by side on one
              screen. */}
          <PlayerShapeChip
            shape={pl.shape}
            label={pl.label}
            fill={pl.style.fill}
            stroke={pl.style.stroke}
            labelColor={deriveLabelColor(pl.style.fill)}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{pl.label}</p>
          </div>
          <Badge variant="default">{pl.role}</Badge>
        </button>
      ))}
    </div>
  );
}
