import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getLeagueSettingsAction } from "@/app/actions/league-settings";
import { listLeagueCurriculumAction } from "@/app/actions/league-curriculum";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import { LeagueCurriculumManager } from "@/features/league/LeagueCurriculumManager";

export const metadata: Metadata = {
  title: "Curriculum · League Console · XO Gridmaker",
};

export default async function CurriculumPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  // Admin-gated (getLeagueSettingsAction returns null for non-admins) and, like
  // the playbook bridge, football-only for now since distribution targets team
  // playbooks.
  const settings = await getLeagueSettingsAction(leagueId);
  if (!settings) notFound();
  if (!leagueHasPlaybooks(settings.sport)) notFound();

  const res = await listLeagueCurriculumAction(leagueId);
  const overview = res.ok ? res.data : { plans: [], teamsTotal: 0, teamsWithPlaybook: 0 };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Curriculum</h1>
      <p className="mt-1 text-sm text-muted">
        Build a practice plan in your playbook, then share it with every team&apos;s coach in one
        click — it lands in their playbook ready to run.
      </p>

      <div className="mt-6">
        <LeagueCurriculumManager leagueId={leagueId} initial={overview} />
      </div>
    </div>
  );
}
