import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { resolveLeagueView } from "@/lib/league/authorize";
import {
  getBroadcastAudiencesAction,
  listBroadcastsAction,
} from "@/app/actions/league-broadcasts";
import { BroadcastsManager } from "@/features/league/BroadcastsManager";

export const metadata: Metadata = {
  title: "Communications · League Console · XO Gridmaker",
};

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const access = await resolveLeagueView(leagueId, {
    delegateCapability: "manage_communications",
  });
  if (!access) notFound();

  const [broadcasts, audiencesRes] = await Promise.all([
    listBroadcastsAction(leagueId),
    getBroadcastAudiencesAction(leagueId),
  ]);
  const audiences = audiencesRes.ok && audiencesRes.audiences
    ? audiencesRes.audiences
    : { families: 0, coaches: 0, everyone: 0, teams: [] };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Communications</h1>
      <p className="mt-1 text-sm text-muted">
        Send announcements by email — to everyone, all families, a single team, or your coaches.
      </p>

      <div className="mt-6">
        <BroadcastsManager
          leagueId={leagueId}
          initialBroadcasts={broadcasts.ok ? broadcasts.items : []}
          audiences={audiences}
        />
      </div>
    </div>
  );
}
