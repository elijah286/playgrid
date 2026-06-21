import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships } from "@/lib/league/access";
import { listLeagueEventsAction } from "@/app/actions/league-events";
import { EventsManager } from "@/features/league/EventsManager";

export const metadata: Metadata = {
  title: "Schedule · League Console · XO Gridmaker",
};

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId)) notFound();

  const res = await listLeagueEventsAction(leagueId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Schedule</h1>
      <p className="mt-1 text-sm text-muted">
        Games, practices, and events. Upcoming items appear on your dashboard.
      </p>

      <div className="mt-6">
        <EventsManager leagueId={leagueId} initialEvents={res.ok ? res.items : []} />
      </div>
    </div>
  );
}
