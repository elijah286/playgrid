import type { Metadata } from "next";
import Link from "next/link";

import { listLibraryAction, listLibrarySourcesAction } from "@/app/actions/league-library";
import { getMyLeagues } from "@/lib/league/console";
import { LeagueLibraryManager } from "@/features/league/LeagueLibraryManager";

export const metadata: Metadata = {
  title: "Library · League Operations · XO Gridmaker",
};

/** Org-level content library — playbook groups + practice plans the operator
 *  can distribute to teams (Phase 1 of the library plan). Portfolio-scoped:
 *  sits beside All leagues / People & access, NOT inside a league, because
 *  content is bound to sport + game type, not to a league. */
export default async function LeagueLibraryPage() {
  const [library, sources, leagues] = await Promise.all([
    listLibraryAction(),
    listLibrarySourcesAction(),
    getMyLeagues(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 text-foreground sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Library</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Play groups and practice plans from your own playbooks, ready to distribute to teams.
            Mark items as defaults and every new team of that game type starts with them.
          </p>
        </div>
        <Link
          href="/playbooks"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-foreground/5"
        >
          Open my playbooks ↗
        </Link>
      </div>

      <div className="mt-6">
        <LeagueLibraryManager
          initialItems={library.ok ? library.items : []}
          initialDefaults={library.ok ? library.defaults : []}
          sources={sources.ok ? sources.playbooks : []}
          leagues={leagues.map((l) => ({ id: l.id, name: l.name }))}
        />
      </div>
    </div>
  );
}
