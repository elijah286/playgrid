import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveLeagueView } from "@/lib/league/authorize";
import { listDivisionsAction } from "@/app/actions/league-divisions";
import { getTeamSeedPreviewAction, listLeagueTeamsAction } from "@/app/actions/league-teams";
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

  const access = await resolveLeagueView(leagueId, { delegateCapability: "manage_teams" });
  if (!access) notFound();

  const [divisionsRes, teamsRes, leagueRes, seedRes] = await Promise.all([
    listDivisionsAction(leagueId),
    listLeagueTeamsAction(leagueId),
    access.db.from("leagues").select("sport").eq("id", leagueId).maybeSingle(),
    getTeamSeedPreviewAction(leagueId),
  ]);
  const divisions = divisionsRes.ok ? divisionsRes.items.map((d) => ({ id: d.id, name: d.name })) : [];
  const sport = (leagueRes.data?.sport as string | null) ?? "football";
  const terms = sportTerms(sport);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 text-foreground sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Teams</h1>
      <p className="mt-1 text-sm text-muted">
        Create teams, group them by division, and give each a {terms.coach}. New teams are seeded
        with their playbook the moment they&apos;re created.
      </p>

      <div className="mt-6">
        <TeamsManager
          leagueId={leagueId}
          initialTeams={teamsRes.ok ? teamsRes.items : []}
          divisions={divisions}
          sport={sport}
          seedPreview={seedRes.ok ? seedRes.preview : null}
        />
      </div>
    </div>
  );
}
