import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships } from "@/lib/league/access";
import { loadLeagueDashboard } from "@/lib/league/console";

export const metadata: Metadata = {
  title: "League Console · XO Gridmaker",
};

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium text-foreground">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export default async function LeagueDashboardPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  // Per-league isolation: a member of league A cannot open league B's console,
  // even though the (league) layout confirmed membership in *some* league.
  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId)) notFound();

  const dash = await loadLeagueDashboard(leagueId);
  if (!dash) notFound();

  const r = dash.registrations;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <Link href="/league" className="text-xs text-muted hover:underline">
        ← All leagues
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{dash.league.name}</h1>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted">{dash.league.sport}</p>

      <h2 className="mt-8 text-sm font-semibold">Structure</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Divisions" value={dash.divisions} />
        <Stat label="Teams" value={dash.teams} />
        <Stat label="Coaches" value={dash.coaches} />
      </div>

      <h2 className="mt-8 text-sm font-semibold">Registrations</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Total" value={r.total} />
        <Stat label="Needs review" value={r.needsReview} hint="Submitted, awaiting a decision" />
        <Stat label="Unrostered" value={r.unrostered} hint="Approved or waitlisted" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Approved" value={r.byStatus.approved} />
        <Stat label="Rostered" value={r.byStatus.rostered} />
        <Stat label="Waitlisted" value={r.byStatus.waitlisted} />
      </div>

      <p className="mt-8 text-xs text-muted">
        Roster management, registration review, and communications arrive in the next console slices.
      </p>
    </div>
  );
}
