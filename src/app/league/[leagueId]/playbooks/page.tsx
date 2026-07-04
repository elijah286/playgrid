import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveLeagueView } from "@/lib/league/authorize";
import { getLeagueSport } from "@/lib/league/console";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import {
  listDistributableLibraryItemsAction,
  listPlaybookDistributionAction,
} from "@/app/actions/league-playbooks";
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

  const access = await resolveLeagueView(leagueId, {
    memberAdminOnly: true,
    delegateCapability: "manage_curriculum",
  });
  if (!access) notFound();

  // Playbook seeding is the football-only coach-product bridge. Read the sport
  // via the authorized client so a delegated member isn't blocked by RLS.
  if (!leagueHasPlaybooks(await getLeagueSport(leagueId, access.db))) notFound();

  const [res, lib] = await Promise.all([
    listPlaybookDistributionAction(leagueId),
    listDistributableLibraryItemsAction(leagueId),
  ]);
  const rows = res.ok ? res.rows : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Playbooks</h1>
      <p className="mt-1 text-sm text-muted">
        Seed teams a starter playbook, distribute play groups and practice plans from your
        library, and invite each head coach to their team&apos;s playbook.
      </p>

      <div className="mt-6">
        <LeaguePlaybooksManager
          leagueId={leagueId}
          initialRows={rows}
          libraryItems={lib.ok ? lib.items : []}
        />
      </div>
    </div>
  );
}
