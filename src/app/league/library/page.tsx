import type { Metadata } from "next";
import Link from "next/link";

import {
  listLibraryAction,
  listLibraryPreviewsAction,
  listLibrarySourcesAction,
} from "@/app/actions/league-library";
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
  const [library, sources, leagues, previewsRes] = await Promise.all([
    listLibraryAction(),
    listLibrarySourcesAction(),
    getMyLeagues(),
    listLibraryPreviewsAction(),
  ]);

  const items = library.ok ? library.items : [];
  const defaults = library.ok ? library.defaults : [];
  const previews = previewsRes.ok ? previewsRes.previews : [];
  const teamsReached = new Set(
    previews.filter((p) => p.teamsReached > 0).map((p) => p.itemId),
  ).size;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 text-foreground sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Library</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Play groups and practice plans from your own playbooks, ready to distribute to teams.
            Mark items as defaults and every new team of that game type starts with them.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {items.length > 0 ? (
            <div className="hidden items-center gap-4 text-xs text-muted lg:flex">
              <span>
                <span className="font-semibold text-foreground">{items.length}</span> item
                {items.length === 1 ? "" : "s"}
              </span>
              <span>
                <span className="font-semibold text-foreground">
                  {new Set(defaults.map((d) => d.itemId)).size}
                </span>{" "}
                seeding new teams
              </span>
              <span>
                <span className="font-semibold text-foreground">{teamsReached}</span> distributed
              </span>
            </div>
          ) : null}
          <Link
            href="/playbooks"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-foreground/5"
          >
            Open my playbooks ↗
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <LeagueLibraryManager
          initialItems={items}
          initialDefaults={defaults}
          sources={sources.ok ? sources.playbooks : []}
          leagues={leagues.map((l) => ({ id: l.id, name: l.name }))}
          previews={previews}
        />
      </div>
    </div>
  );
}
