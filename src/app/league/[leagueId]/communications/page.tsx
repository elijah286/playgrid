import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships } from "@/lib/league/access";
import {
  leagueCoachEmailCountAction,
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

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId)) notFound();

  const [broadcasts, coachCount] = await Promise.all([
    listBroadcastsAction(leagueId),
    leagueCoachEmailCountAction(leagueId),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Communications</h1>
      <p className="mt-1 text-sm text-muted">
        Send announcements to your league. Today this reaches coaches by email.
      </p>

      <div className="mt-6">
        <BroadcastsManager
          leagueId={leagueId}
          initialBroadcasts={broadcasts.ok ? broadcasts.items : []}
          coachCount={coachCount}
        />
      </div>
    </div>
  );
}
