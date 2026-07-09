import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveLeagueView } from "@/lib/league/authorize";
import { getGamesBoardAction } from "@/app/actions/league-games";
import { sportTerms } from "@/lib/league/sportConfig";
import { GamesAndStandings } from "@/features/league/GamesAndStandings";

export const metadata: Metadata = {
  title: "Games & Standings · League Console · XO Gridmaker",
};

export default async function GamesPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const access = await resolveLeagueView(leagueId, {
    memberAdminOnly: true,
    delegateCapability: "manage_schedule",
  });
  if (!access) notFound();

  const res = await getGamesBoardAction(leagueId);
  const board =
    res.ok && res.board ? res.board : { teams: [], games: [], standings: [], sport: "football" };
  const terms = sportTerms(board.sport);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 text-foreground sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{terms.Games} &amp; Standings</h1>
      <p className="mt-1 text-sm text-muted">
        Schedule {terms.games} between your teams, enter scores, and standings update automatically.
      </p>

      <div className="mt-6">
        <GamesAndStandings leagueId={leagueId} initial={board} />
      </div>
    </div>
  );
}
