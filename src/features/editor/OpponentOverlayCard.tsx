"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronRight, Eye, EyeOff, Pencil, Save, Search, Swords, Users, X } from "lucide-react";
import type { PlayDocument, Player, Route } from "@/domain/play/types";
import type { PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import type { SavedFormation } from "@/app/actions/formations";
import { getPlayForEditorAction } from "@/app/actions/plays";
import { useToast } from "@/components/ui";

type Props = {
  currentPlayId: string;
  /** Used to scope formations and plays to this playbook only. */
  currentPlaybookId: string;
  playType: PlayDocument["metadata"]["playType"];
  nav: PlaybookPlayNavItem[];
  allFormations: SavedFormation[];
  hasSelection: boolean;
  onChange: (players: Player[] | null) => void;
  /**
   * Defense-only. When provided, the card exposes an "Install vs this play"
   * button for the currently-selected offensive play. The handler is
   * expected to snapshot the offense into a new matchup play and navigate.
   */
  onInstallVsPlay?: (offensivePlayId: string) => Promise<void> | void;
  /** True when a hidden custom-opponent play is attached to this play. */
  hasCustomOpponent?: boolean;
  /** True when the user "cleared" the overlay — custom data preserved but
   *  hidden in the canvas. */
  opponentHidden?: boolean;
  /** Whether the viewer can mutate the custom opponent (canEdit + not in
   *  game mode). Drag and Save-as actions are disabled when false. */
  canEditCustom?: boolean;
  /** Create a new custom opponent (drops default defenders/offense). */
  onCreateCustom?: () => Promise<void> | void;
  /** Toggle opponent_hidden (Clear vs Show). */
  onSetHidden?: (hidden: boolean) => Promise<void> | void;
  /** Promote the hidden custom into a standalone play under the given name. */
  onSaveCustomAsPlay?: (name: string) => Promise<void> | void;
  /** Optional callback for the picked play's routes. The parent decides
   *  whether to render them based on `showRoutes`. Resets to null when the
   *  selection clears or moves to a formation. */
  onChangeRoutes?: (routes: Route[] | null) => void;
  /** When provided, the card surfaces a "Show offense routes" checkbox under
   *  a play selection so the defensive coach can see the offense's routes
   *  while drawing the defensive reaction. */
  showRoutes?: boolean;
  onShowRoutesChange?: (next: boolean) => void;
};

// Heuristic: defenders are stored with `shape: "triangle"` by default. Use
// this to filter mixed-side player rosters that may have leaked into a play's
// own `layers.players` from older install/copy paths. Special-teams shapes
// (square/diamond/star) are kept regardless of the wanted side.
function isLikelyDefenderShape(p: Player): boolean {
  return p.shape === "triangle";
}
function isLikelyOffenseShape(p: Player): boolean {
  // Default (undefined) and "circle" are the offensive default.
  return p.shape == null || p.shape === "circle";
}
function filterToOpposingSide(
  players: Player[],
  pickedPlayType: PlayDocument["metadata"]["playType"] | undefined,
): Player[] {
  // Trust the picked play's declared playType: offense plays should only
  // surface offense tokens, defense plays only defense tokens. Special-teams
  // and unknown types pass through unchanged.
  if (pickedPlayType === "offense") return players.filter((p) => !isLikelyDefenderShape(p));
  if (pickedPlayType === "defense") return players.filter((p) => !isLikelyOffenseShape(p));
  return players;
}

type Selection =
  | { kind: "none" }
  | { kind: "custom" }
  | { kind: "formation"; id: string; label: string }
  | { kind: "play"; id: string; label: string };

/**
 * View-only opponent overlay picker. Searchable list grouped into
 * "Formations" and "Plays". Selecting a row surfaces the opposing-side
 * player positions up to the canvas as a transient ghost overlay. Never
 * mutates or persists the current play.
 */
export function OpponentOverlayCard({
  currentPlayId,
  currentPlaybookId,
  playType,
  nav,
  allFormations,
  hasSelection,
  onChange,
  onInstallVsPlay,
  hasCustomOpponent = false,
  opponentHidden = false,
  canEditCustom = false,
  onCreateCustom,
  onSetHidden,
  onSaveCustomAsPlay,
  onChangeRoutes,
  showRoutes = false,
  onShowRoutesChange,
}: Props) {
  const { toast } = useToast();
  const [selection, setSelection] = useState<Selection>(
    hasCustomOpponent ? { kind: "custom" } : { kind: "none" },
  );
  // Tracks whether the most recently picked play (selection.kind === "play")
  // had any routes saved. Drives the disabled state on "Show routes" so coaches
  // get a visual hint that the box won't do anything for this opponent.
  const [pickedHasRoutes, setPickedHasRoutes] = useState(false);
  const [query, setQuery] = useState("");
  const [formationsOpen, setFormationsOpen] = useState(false);
  const [playsOpen, setPlaysOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [installing, startInstall] = useTransition();
  const [customPending, startCustomPending] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const wantKinds: Array<"offense" | "defense" | "special_teams"> =
    playType === "offense"
      ? ["defense"]
      : playType === "defense"
        ? ["offense"]
        : playType === "special_teams"
          ? ["offense", "defense", "special_teams"]
          : []; // practice_plan: no opponent overlay applicable

  const eligibleFormations = useMemo(
    () =>
      allFormations.filter((f) => {
        const k = f.kind ?? "offense";
        if (k === "practice_plan") return false;
        return (
          f.playbookId === currentPlaybookId &&
          wantKinds.includes(k as "offense" | "defense" | "special_teams")
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFormations, playType, currentPlaybookId],
  );

  const eligiblePlays = useMemo(
    () =>
      nav.filter(
        (p) =>
          p.id !== currentPlayId &&
          p.current_version_id != null &&
          wantKinds.includes(p.play_type),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav, currentPlayId, playType],
  );

  const q = query.trim().toLowerCase();
  const matches = (s: string) => s.toLowerCase().includes(q);
  const filteredFormations = q
    ? eligibleFormations.filter((f) => matches(f.displayName))
    : eligibleFormations;
  const filteredPlays = q
    ? eligiblePlays.filter(
        (p) =>
          matches(p.name) ||
          matches(p.formation_name) ||
          matches(p.concept) ||
          matches(p.wristband_code) ||
          matches(p.shorthand),
      )
    : eligiblePlays;

  const pickFormation = (f: SavedFormation) => {
    setSelection({ kind: "formation", id: f.id, label: f.displayName });
    setPickedHasRoutes(false);
    onChange(f.players);
    onChangeRoutes?.(null);
  };

  const pickPlay = (p: PlaybookPlayNavItem) => {
    setSelection({ kind: "play", id: p.id, label: p.name });
    setPickedHasRoutes(false);
    startTransition(async () => {
      const res = await getPlayForEditorAction(p.id);
      if (!res.ok) {
        toast(res.error, "error");
        setSelection({ kind: "none" });
        return;
      }
      // Filter to the opposing side. Picked plays should only contribute
      // their own side's players — never the side they themselves were
      // installed against. Without this, picking an offensive play that has
      // a defense installed (custom opponent or older mixed data) doubles
      // up the field.
      const allPlayers = res.document.layers.players ?? [];
      const players = filterToOpposingSide(allPlayers, p.play_type);
      if (players.length === 0) {
        toast(
          `"${p.name}" has no opposing player positions saved — open it and place players first.`,
          "error",
        );
        setSelection({ kind: "none" });
        return;
      }
      onChange(players);
      const routes = res.document.layers.routes ?? [];
      setPickedHasRoutes(routes.length > 0);
      // Surface the picked play's routes so the parent can optionally render
      // them as ghost arrows (see `showRoutes`).
      onChangeRoutes?.(routes);
    });
  };

  const clear = () => {
    // For custom opponents, "clear" means hide-without-deleting via the
    // server (preserves the hidden play). For transient picks (formation/
    // play), it just resets local state.
    if (hasCustomOpponent && onSetHidden) {
      startCustomPending(async () => {
        await onSetHidden(true);
      });
      return;
    }
    setSelection({ kind: "none" });
    setPickedHasRoutes(false);
    onChange(null);
    onChangeRoutes?.(null);
  };

  const showCustom = () => {
    if (!onSetHidden) return;
    startCustomPending(async () => {
      await onSetHidden(false);
    });
  };

  const pickCustom = () => {
    if (!onCreateCustom) return;
    startCustomPending(async () => {
      await onCreateCustom();
      setSelection({ kind: "custom" });
    });
  };

  const submitSave = () => {
    if (!onSaveCustomAsPlay) return;
    const name = saveName.trim();
    if (!name) {
      toast("Enter a name for the new defensive play.", "error");
      return;
    }
    startCustomPending(async () => {
      await onSaveCustomAsPlay(name);
      setSaveOpen(false);
      setSaveName("");
    });
  };

  const label =
    playType === "offense"
      ? "View against defense"
      : playType === "defense"
        ? "View against offense"
        : "View against opponent";

  const empty =
    filteredFormations.length === 0 && filteredPlays.length === 0;
  // No plays/formations of the wanted kind exist anywhere in this playbook —
  // distinct from "search returned nothing." Drives a richer empty-state
  // card and hides the search bar (nothing to search through).
  const playbookHasNoEligible =
    eligibleFormations.length === 0 && eligiblePlays.length === 0;
  const opposingKindLabel =
    playType === "offense"
      ? "defensive plays"
      : playType === "defense"
        ? "offensive plays"
        : "opponent plays";

  return (
    <div className="flex max-h-[420px] min-h-0 flex-col rounded-xl border border-border bg-surface-inset/50">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Opponent
        </p>
        {hasSelection && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
            title="Clear opponent"
          >
            <X className="size-3.5" />
            Clear
          </button>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-3 pt-1 text-[11px] font-medium text-muted">
        <Users className="size-3.5" />
        {label}
      </p>

      {!playbookHasNoEligible && (
        <div className="relative px-3 pt-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search formations and plays…"
            className="w-full rounded-md border border-border bg-surface-raised py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {selection.kind === "custom" && hasCustomOpponent && (
        <div className="mx-3 mt-2 flex flex-col gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-foreground">
              <Pencil className="size-3 text-amber-500" />
              <span className="font-medium">Custom opponent</span>
              {opponentHidden && (
                <span className="ml-1 rounded bg-surface-inset px-1 py-0.5 text-[10px] text-muted">
                  hidden
                </span>
              )}
            </span>
            {customPending && <span className="text-[10px] text-muted">working…</span>}
          </div>
          <p className="text-[11px] leading-snug text-muted">
            {canEditCustom
              ? "Drag opposing players on the field to position them. Saved automatically."
              : "Saved with this play. Switch to edit mode to drag."}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {opponentHidden ? (
              <button
                type="button"
                disabled={customPending}
                onClick={showCustom}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface-inset disabled:opacity-60"
              >
                <Eye className="size-3" />
                Show
              </button>
            ) : null}
            {canEditCustom && onSaveCustomAsPlay && !opponentHidden && (
              <button
                type="button"
                disabled={customPending}
                onClick={() => {
                  setSaveName("");
                  setSaveOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                <Save className="size-3" />
                Save as defensive play
              </button>
            )}
          </div>
          {saveOpen && (
            <div className="mt-1 flex flex-col gap-1 rounded border border-border bg-surface-raised p-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                New play name
              </label>
              <input
                type="text"
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSave();
                  if (e.key === "Escape") setSaveOpen(false);
                }}
                placeholder="e.g. Cover 2 Zone"
                className="w-full rounded border border-border bg-surface-inset px-2 py-1 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              />
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setSaveOpen(false)}
                  className="rounded px-2 py-1 text-[11px] text-muted hover:bg-surface-inset hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={customPending || saveName.trim().length === 0}
                  onClick={submitSave}
                  className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selection.kind !== "none" && selection.kind !== "custom" && (
        <div className="mx-3 mt-2 flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="min-w-0 truncate text-foreground">
              <span className="mr-1 text-[10px] uppercase text-primary">
                {selection.kind === "formation" ? "Form" : "Play"}
              </span>
              {selection.label}
            </span>
            {pending && <span className="text-[10px] text-muted">loading…</span>}
          </div>
          {selection.kind === "play" && onShowRoutesChange && (
            <label
              className={`flex select-none items-center gap-1.5 text-[11px] ${
                pickedHasRoutes
                  ? "cursor-pointer text-muted"
                  : "cursor-not-allowed text-muted/50"
              }`}
              title={
                pickedHasRoutes
                  ? undefined
                  : "This opponent play has no routes saved."
              }
            >
              <input
                type="checkbox"
                disabled={!pickedHasRoutes}
                className="size-3.5 accent-primary disabled:cursor-not-allowed"
                checked={pickedHasRoutes && showRoutes}
                onChange={(e) => onShowRoutesChange(e.target.checked)}
              />
              <span>Show {playType === "defense" ? "offense" : "opponent"} routes</span>
            </label>
          )}
          {selection.kind === "play" && onInstallVsPlay && (
            <button
              type="button"
              disabled={installing}
              onClick={() => {
                const offId = selection.id;
                startInstall(async () => {
                  await onInstallVsPlay(offId);
                });
              }}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Swords className="size-3" />
              {installing ? "Installing…" : "Install vs this play"}
            </button>
          )}
        </div>
      )}

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {canEditCustom && onCreateCustom && !hasCustomOpponent && q.length === 0 && (
          <div className="px-2 pb-2">
            <button
              type="button"
              disabled={customPending}
              onClick={pickCustom}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-amber-400/50 bg-amber-400/5 px-2 py-2 text-left text-xs text-foreground transition-colors hover:bg-amber-400/10 disabled:opacity-60"
            >
              <Pencil className="size-3.5 text-amber-500" />
              <span className="flex flex-col">
                <span className="font-medium">Custom</span>
                <span className="text-[11px] text-muted">
                  Drop a default opponent and arrange it for this play
                </span>
              </span>
            </button>
          </div>
        )}

        {empty && !hasCustomOpponent && q.length > 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted">No matches.</p>
        )}

        {playbookHasNoEligible && !hasCustomOpponent && q.length === 0 && (
          <div className="mx-3 my-2 rounded-md border border-border bg-surface-raised px-3 py-3 text-xs leading-snug text-muted">
            <p className="font-medium text-foreground">
              No {opposingKindLabel} in this playbook yet.
            </p>
            <p className="mt-1">
              {onCreateCustom
                ? "Drop a custom opponent above to sketch one for this play, or add real ones to the playbook later."
                : "Add some to the playbook to view them here."}
            </p>
          </div>
        )}

        {filteredPlays.length > 0 && (
          <Group
            title="Plays"
            count={filteredPlays.length}
            open={playsOpen || q.length > 0}
            onToggle={() => setPlaysOpen((v) => !v)}
          >
            {filteredPlays.map((p) => {
              const active =
                selection.kind === "play" && selection.id === p.id;
              return (
                <RowButton
                  key={p.id}
                  active={active}
                  onClick={() => pickPlay(p)}
                  primary={p.name}
                  secondary={
                    [p.formation_name, p.concept].filter(Boolean).join(" · ") ||
                    labelForKind(p.play_type)
                  }
                  editHref={`/plays/${p.id}/edit`}
                />
              );
            })}
          </Group>
        )}

        {filteredFormations.length > 0 && (
          <Group
            title="Formations"
            count={filteredFormations.length}
            open={formationsOpen || q.length > 0}
            onToggle={() => setFormationsOpen((v) => !v)}
          >
            {filteredFormations.map((f) => {
              const active =
                selection.kind === "formation" && selection.id === f.id;
              return (
                <RowButton
                  key={f.id}
                  active={active}
                  onClick={() => pickFormation(f)}
                  primary={f.displayName}
                  secondary={labelForKind(f.kind ?? "offense")}
                />
              );
            })}
          </Group>
        )}
      </div>

      <p className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted">
        View-only. Not saved to this play; resets when you leave.
      </p>
    </div>
  );
}

function Group({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 pb-1">
      <button
        type="button"
        onClick={onToggle}
        className="sticky top-0 z-10 flex w-full items-center justify-between gap-1 rounded bg-surface-inset/90 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted backdrop-blur hover:text-foreground"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1">
          <ChevronRight
            className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {title}
        </span>
        <span>{count}</span>
      </button>
      {open && <ul className="mt-1 space-y-0.5">{children}</ul>}
    </div>
  );
}

function RowButton({
  active,
  onClick,
  primary,
  secondary,
  editHref,
}: {
  active: boolean;
  onClick: () => void;
  primary: string;
  secondary?: string;
  editHref?: string;
}) {
  return (
    <li
      className={`group flex items-stretch rounded-md transition-colors ${
        active
          ? "bg-primary/10 ring-1 ring-primary/40"
          : "hover:bg-surface-inset"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-xs text-foreground"
      >
        <div className="truncate font-medium">{primary}</div>
        {secondary && (
          <div className="truncate text-[11px] text-muted">{secondary}</div>
        )}
      </button>
      {editHref && (
        <a
          href={editHref}
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          title="Edit this play"
        >
          <Pencil className="size-3" />
          Edit
        </a>
      )}
    </li>
  );
}

function labelForKind(kind: "offense" | "defense" | "special_teams" | "practice_plan") {
  return kind === "offense"
    ? "Offense"
    : kind === "defense"
      ? "Defense"
      : kind === "special_teams"
        ? "Special teams"
        : "Practice plan";
}
