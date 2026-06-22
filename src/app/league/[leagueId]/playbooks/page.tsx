import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships, isLeagueAdminRole } from "@/lib/league/access";
import { getLeagueSport } from "@/lib/league/console";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import { listLeaguePlaybooksAction } from "@/app/actions/league-playbooks";
import { LeaguePlaybooksManager } from "@/features/league/LeaguePlaybooksManager";

export const metadata: Metadata = {
  title: "Playbooks · League Console · XO Gridmaker",
};

export default async function LeaguePlaybooksPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId && isLeagueAdminRole(m.role))) notFound();

  // Playbook seeding is the football-only coach-product bridge.
  if (!leagueHasPlaybooks(await getLeagueSport(leagueId))) notFound();

  const res = await listLeaguePlaybooksAction(leagueId);
  const teams = res.ok ? res.teams : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Playbooks</h1>
      <p className="mt-1 text-sm text-muted">
        Seed each team a starter playbook, then email the head coach their own copy — they land in
        XO Gridmaker ready to build on their team&apos;s plays.
      </p>

      <div className="mt-6">
        <LeaguePlaybooksManager leagueId={leagueId} initialTeams={teams} />
      </div>
    </div>
  );
}
