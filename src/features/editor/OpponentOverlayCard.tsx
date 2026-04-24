"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronRight, Search, Swords, Users, X } from "lucide-react";
import type { PlayDocument, Player } from "@/domain/play/types";
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
};

type Selection =
  | { kind: "none" }
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
}: Props) {
  const { toast } = useToast();
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [formationsOpen, setFormationsOpen] = useState(false);
  const [playsOpen, setPlaysOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [installing, startInstall] = useTransition();

  const wantKinds: Array<"offense" | "defense" | "special_teams"> =
    playType === "offense"
      ? ["defense"]
      : playType === "defense"
        ? ["offense"]
        : ["offense", "defense", "special_teams"];

  const eligibleFormations = useMemo(
    () =>
      allFormations.filter(
        (f) =>
          f.playbookId === currentPlaybookId &&
          wantKinds.includes(f.kind ?? "offense"),
      ),
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
    onChange(f.players);
  };

  const pickPlay = (p: PlaybookPlayNavItem) => {
    setSelection({ kind: "play", id: p.id, label: p.name });
    startTransition(async () => {
      const res = await getPlayForEditorAction(p.id);
      if (!res.ok) {
        toast(res.error, "error");
        setSelection({ kind: "none" });
        return;
      }
      const players = res.document.layers.players ?? [];
      if (players.length === 0) {
        toast(
          `"${p.name}" has no player positions saved — open it and place defenders first.`,
          "error",
        );
        setSelection({ kind: "none" });
        return;
      }
      onChange(players);
    });
  };

  const clear = () => {
    setSelection({ kind: "none" });
    onChange(null);
  };

  const label =
    playType === "offense"
      ? "View against defense"
      : playType === "defense"
        ? "View against offense"
        : "View against opponent";

  const empty =
    filteredFormations.length === 0 && filteredPlays.length === 0;

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

      {selection.kind !== "none" && (
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
        {empty && (
          <p className="px-3 py-6 text-center text-xs text-muted">
            {q ? "No matches." : "No eligible plays or formations yet."}
          </p>
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
}: {
  active: boolean;
  onClick: () => void;
  primary: string;
  secondary?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
          active
            ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
            : "text-foreground hover:bg-surface-inset"
        }`}
      >
        <div className="truncate font-medium">{primary}</div>
        {secondary && (
          <div className="truncate text-[11px] text-muted">{secondary}</div>
        )}
      </button>
    </li>
  );
}

function labelForKind(kind: "offense" | "defense" | "special_teams") {
  return kind === "offense"
    ? "Offense"
    : kind === "defense"
      ? "Defense"
      : "Special teams";
}
