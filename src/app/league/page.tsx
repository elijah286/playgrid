import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { getMyLeagues, loadLeagueDashboard } from "@/lib/league/console";
import { CreateLeagueForm } from "@/features/league/CreateLeagueForm";
import { LeagueDashboardSkeleton } from "@/features/league/LeagueDashboardSkeleton";

export const metadata: Metadata = {
  title: "League Operations · XO Gridmaker",
};

/** Portfolio home: the operator's leagues. Always shown (even for a single
 *  league) so operators can see, navigate, and add leagues; none → a first-run
 *  prompt over a preview of the dashboard. */
export default async function LeagueHomePage() {
  const leagues = await getMyLeagues();

  if (leagues.length === 0) {
    return (
      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div aria-hidden className="pointer-events-none select-none opacity-[0.45] blur-[2px]">
          <LeagueDashboardSkeleton />
        </div>
        <div className="absolute inset-0 flex items-start justify-center px-4 pt-10 sm:pt-20">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-xl sm:p-8">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              Let&apos;s set up your league
            </h1>
            <p className="mt-2 text-sm text-muted">
              Give your league a name to open your operations console — registration,
              rosters, schedule, communications, and more.
            </p>
            <div className="mt-5">
              <CreateLeagueForm autoFocus cta="Create my league" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const summaries = await Promise.all(leagues.map((l) => loadLeagueDashboard(l.id)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Your leagues</h1>
      <p className="mt-1 text-sm text-muted">Pick a league to open its console.</p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {leagues.map((l, i) => {
          const d = summaries[i];
          const r = d?.registrations;
          return (
            <li key={l.id}>
              <Link
                href={`/league/${l.id}`}
                className="block rounded-2xl border border-border bg-surface-raised p-4 transition hover:bg-foreground/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{l.name}</div>
                    <div className="text-xs uppercase tracking-wide text-muted">{l.sport}</div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{d?.teams ?? 0} teams</span>
                  <span>{r?.total ?? 0} players</span>
                  {r && r.needsReview > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">{r.needsReview} to review</span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 max-w-md border-t border-border pt-6">
        <p className="mb-3 text-sm font-medium text-foreground">Add another league</p>
        <CreateLeagueForm />
      </div>
    </div>
  );
}
