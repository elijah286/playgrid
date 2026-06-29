import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships, isLeagueAdminRole } from "@/lib/league/access";
import { getLeagueSettingsAction } from "@/app/actions/league-settings";
import { LeagueSettingsManager } from "@/features/league/LeagueSettingsManager";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export const metadata: Metadata = {
  title: "Settings · League Console · XO Gridmaker",
};

export default async function LeagueSettingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId && isLeagueAdminRole(m.role))) notFound();

  const settings = await getLeagueSettingsAction(leagueId);
  if (!settings) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Rename your league, set a short registration link, or remove the league.
      </p>

      <div className="mt-6">
        <LeagueSettingsManager
          leagueId={leagueId}
          initial={settings}
          registerBase={`${SITE_URL}/register/`}
        />
      </div>
    </div>
  );
}
