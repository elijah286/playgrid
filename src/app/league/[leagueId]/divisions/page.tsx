import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveLeagueView } from "@/lib/league/authorize";
import { listDivisionsAction } from "@/app/actions/league-divisions";
import { DivisionsManager } from "@/features/league/DivisionsManager";

export const metadata: Metadata = {
  title: "Divisions · League Console · XO Gridmaker",
};

export default async function DivisionsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  // Per-league isolation (the layout already confirmed organizer access).
  const access = await resolveLeagueView(leagueId, { delegateCapability: "manage_teams" });
  if (!access) notFound();

  const res = await listDivisionsAction(leagueId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Divisions</h1>
      <p className="mt-1 text-sm text-muted">
        Age groups for this league. Co-ed is pre-filled — turn on Boys/Girls per age, mark which run
        this season, and set birthdate windows (they flag eligibility at registration, never hard-block).
      </p>

      <div className="mt-6">
        <DivisionsManager leagueId={leagueId} initialItems={res.ok ? res.items : []} />
      </div>
    </div>
  );
}
