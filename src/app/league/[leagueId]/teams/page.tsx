import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships } from "@/lib/league/access";
import { listDivisionsAction } from "@/app/actions/league-divisions";
import { listLeagueTeamsAction } from "@/app/actions/league-teams";
import { TeamsManager } from "@/features/league/TeamsManager";

export const metadata: Metadata = {
  title: "Teams · League Console · XO Gridmaker",
};

export default async function TeamsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId)) notFound();

  const [divisionsRes, teamsRes] = await Promise.all([
    listDivisionsAction(leagueId),
    listLeagueTeamsAction(leagueId),
  ]);
  const divisions = divisionsRes.ok ? divisionsRes.items.map((d) => ({ id: d.id, name: d.name })) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Teams</h1>
        <Link
          href={`/league/${leagueId}/divisions`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Manage divisions →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Create teams and group them by division. Assigning coaches and players comes next.
      </p>

      <div className="mt-6">
        <TeamsManager
          leagueId={leagueId}
          initialTeams={teamsRes.ok ? teamsRes.items : []}
          divisions={divisions}
        />
      </div>
    </div>
  );
}
