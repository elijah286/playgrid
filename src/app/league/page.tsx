import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { getMyLeagues, loadLeagueDashboard } from "@/lib/league/console";
import { CreateLeagueForm } from "@/features/league/CreateLeagueForm";

export const metadata: Metadata = {
  title: "League Operations · XO Gridmaker",
};

/** Portfolio of the operator's leagues. One league → skip straight to it. */
export default async function LeagueHomePage() {
  const leagues = await getMyLeagues();

  // Single-league operators skip the portfolio and land in their console.
  if (leagues.length === 1) redirect(`/league/${leagues[0].id}`);

  const summaries = await Promise.all(leagues.map((l) => loadLeagueDashboard(l.id)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Your leagues</h1>
      <p className="mt-1 text-sm text-muted">
        {leagues.length === 0
          ? "Create your first league to open its console."
          : "Pick a league to open its console."}
      </p>

      {leagues.length > 0 ? (
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
      ) : null}

      <div className="mt-8 border-t border-border pt-6">
        <CreateLeagueForm />
      </div>
    </div>
  );
}
