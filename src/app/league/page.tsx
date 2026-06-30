import type { Metadata } from "next";

import { getPortfolioSummary } from "@/lib/league/console";
import { listLeagueGroupsAction } from "@/app/actions/league-groups";
import { CreateLeagueForm } from "@/features/league/CreateLeagueForm";
import { LeagueGroupsManager } from "@/features/league/LeagueGroupsManager";
import { LeagueDashboardSkeleton } from "@/features/league/LeagueDashboardSkeleton";
import { PortfolioLeagueTable } from "@/features/league/PortfolioLeagueTable";

export const metadata: Metadata = {
  title: "League Operations · XO Gridmaker",
};

function money(cents: number): string {
  if (cents >= 100000) return `$${(cents / 100000).toFixed(1)}k`;
  return `$${Math.round(cents / 100)}`;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-surface-inset px-3.5 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
    </div>
  );
}

function Attn({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 border-l border-border px-4 py-2.5 first:border-l-0">
      <span className="text-xl font-semibold tabular-nums text-foreground">{n}</span>
      <span className="text-xs leading-tight text-muted">{label}</span>
    </div>
  );
}

/** Portfolio home: the operator's command center across every league. */
export default async function LeagueHomePage() {
  const summary = await getPortfolioSummary();

  if (summary.leagues.length === 0) {
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

  const { totals, leagues } = summary;
  const groups = await listLeagueGroupsAction();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-foreground sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">League Operations</h1>
          <p className="mt-1 text-sm text-muted">
            {totals.leagues} leagues · {totals.cities} cities · {totals.sports} sports
          </p>
        </div>
        <a
          href="#add-league"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
        >
          + New league
        </a>
      </div>

      {/* KPI row */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Active leagues" value={String(totals.leagues)} sub={`across ${totals.cities} cities`} />
        <Kpi label="Teams" value={String(totals.teams)} sub={`${totals.sports} sports`} />
        <Kpi
          label="Registrations"
          value={totals.registrations.toLocaleString()}
          sub={`${totals.rostered.toLocaleString()} rostered`}
        />
        <Kpi label="Fill rate" value={`${Math.round(totals.fillPct * 100)}%`} sub="rostered ÷ capacity" />
        <Kpi label="Revenue" value={money(totals.revenuePaidCents)} sub={`${money(totals.revenueUnpaidCents)} pending`} />
      </div>

      {/* needs attention */}
      <div className="mt-4 overflow-hidden rounded-xl bg-surface-inset">
        <div className="px-4 pb-1 pt-2.5 text-[11px] uppercase tracking-wide text-muted">Needs attention</div>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Attn n={totals.needsReview} label="registrations to approve" />
          <Attn n={totals.teamsWithoutCoach} label="teams without a coach" />
          <Attn n={totals.unrostered} label="approved, not yet rostered" />
          <Attn n={totals.windowsClosingSoon} label="windows close this week" />
        </div>
      </div>

      {/* faceted league table */}
      <div className="mt-7">
        <PortfolioLeagueTable leagues={leagues} />
      </div>

      {/* groups + create (secondary) */}
      <div className="mt-10 grid gap-8 border-t border-border pt-7 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Groups</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            Group leagues (e.g. by city) to message every league in a group at once.
          </p>
          <LeagueGroupsManager
            leagues={leagues.map((l) => ({ id: l.id, name: l.name }))}
            initialGroups={groups}
          />
        </div>
        <div id="add-league">
          <h2 className="text-sm font-semibold text-foreground">Add a league</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">Spin up another league in your portfolio.</p>
          <CreateLeagueForm />
        </div>
      </div>
    </div>
  );
}
