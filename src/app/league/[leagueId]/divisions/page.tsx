import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships } from "@/lib/league/access";
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
  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId)) notFound();

  const res = await listDivisionsAction(leagueId);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Divisions</h1>
      <p className="mt-1 text-sm text-muted">
        Age groups for this league. Birthdate windows drive eligibility checks at registration.
      </p>

      <div className="mt-6">
        <DivisionsManager leagueId={leagueId} initialItems={res.ok ? res.items : []} />
      </div>
    </div>
  );
}
