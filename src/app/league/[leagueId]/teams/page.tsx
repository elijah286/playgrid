import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships } from "@/lib/league/access";
import { createClient } from "@/lib/supabase/server";
import { listDivisionsAction } from "@/app/actions/league-divisions";
import { listLeagueTeamsAction } from "@/app/actions/league-teams";
import { sportTerms } from "@/lib/league/sportConfig";
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

  const supabase = await createClient();
  const [divisionsRes, teamsRes, leagueRes] = await Promise.all([
    listDivisionsAction(leagueId),
    listLeagueTeamsAction(leagueId),
    supabase.from("leagues").select("sport").eq("id", leagueId).maybeSingle(),
  ]);
  const divisions = divisionsRes.ok ? divisionsRes.items.map((d) => ({ id: d.id, name: d.name })) : [];
  const sport = (leagueRes.data?.sport as string | null) ?? "football";
  const terms = sportTerms(sport);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Teams</h1>
      <p className="mt-1 text-sm text-muted">
        Create teams, group them by division, and give each a {terms.coach}.
      </p>

      <div className="mt-6">
        <TeamsManager
          leagueId={leagueId}
          initialTeams={teamsRes.ok ? teamsRes.items : []}
          divisions={divisions}
          sport={sport}
        />
      </div>
    </div>
  );
}
