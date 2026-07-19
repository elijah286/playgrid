"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { setSelectedTeamAction } from "@/app/actions/app-shell";

const FALLBACK = "#64748B";

type PickTeam = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  season: string | null;
};

/** Shown on the Team tab when no single team is selected ("All teams"). */
export function TeamPicker({ teams }: { teams: PickTeam[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const pick = (id: string) => {
    startTransition(async () => {
      await setSelectedTeamAction(id);
      router.refresh();
    });
  };

  if (teams.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-inset text-muted">
          <Users className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-extrabold text-foreground">No teams yet</h1>
        <p className="mt-1.5 text-sm text-muted">Create your first team to get started.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-extrabold tracking-tight text-foreground">Pick a team</h1>
      <p className="mt-0.5 text-sm text-muted">Choose a team to open its hub.</p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {teams.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => pick(t.id)}
              disabled={pending}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 text-left transition-colors hover:bg-surface-inset"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-black text-white"
                style={{ backgroundColor: t.color || FALLBACK }}
              >
                {t.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-foreground">{t.name}</span>
                {t.season && <span className="block truncate text-xs text-muted">{t.season}</span>}
              </span>
              {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
