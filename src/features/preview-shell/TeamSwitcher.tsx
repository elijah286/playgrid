"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { setSelectedTeamAction } from "@/app/actions/app-shell";
import { ALL_TEAMS } from "@/features/preview-shell/selected-team";
import { CreateTeamSheet } from "@/features/preview-shell/CreateTeamSheet";
import type { ShellTeam } from "@/features/preview-shell/types";

const FALLBACK_COLOR = "#64748B";

/**
 * The persistent team-context pill — "carry the team, not the boundary."
 * Tapping it re-scopes the current screen in place (sets a cookie + refreshes),
 * with no round-trip to a lobby. "All teams" is the widest setting.
 */
export function TeamSwitcher({
  teams,
  selected,
}: {
  teams: ShellTeam[];
  selected: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = teams.find((t) => t.id === selected) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (value: string) => {
    setOpen(false);
    if (value === selected) return;
    startTransition(async () => {
      await setSelectedTeamAction(value);
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex max-w-[60vw] items-center gap-2 rounded-full border border-border bg-surface-raised py-1 pl-1.5 pr-2.5 text-sm font-bold text-foreground transition-colors hover:bg-surface-inset"
      >
        <TeamMark team={current} />
        <span className="truncate">{current ? current.name : "All teams"}</span>
        {pending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted" aria-hidden />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label="Switch team"
            className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-elevated"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Switch team
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(ALL_TEAMS)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-inset"
            >
              <span className="grid size-6 place-items-center rounded-md bg-muted-light/40 text-[10px] font-black text-muted">
                ★
              </span>
              <span className="flex-1 font-semibold text-foreground">All teams</span>
              {selected === ALL_TEAMS && <Check className="size-4 text-primary" />}
            </button>
            <div className="max-h-64 overflow-y-auto border-t border-border">
              {teams.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted">No teams yet.</p>
              )}
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(t.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-inset"
                >
                  <TeamMark team={t} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">
                      {t.name}
                    </span>
                    {t.season && (
                      <span className="block truncate text-xs text-muted">{t.season}</span>
                    )}
                  </span>
                  {selected === t.id && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm font-semibold text-primary hover:bg-surface-inset"
            >
              <Plus className="size-4" />
              New team
            </button>
          </div>
        </>
      )}

      {creating && <CreateTeamSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function TeamMark({ team }: { team: ShellTeam | null }) {
  if (!team) {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted-light/40 text-[10px] font-black text-muted">
        ◎
      </span>
    );
  }
  const color = team.color || FALLBACK_COLOR;
  return (
    <span
      className="relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-md text-[10px] font-black text-white"
      style={{ backgroundColor: color }}
    >
      {team.logoUrl ? (
        <Image src={team.logoUrl} alt="" fill sizes="24px" className="object-contain p-0.5" />
      ) : (
        team.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}
