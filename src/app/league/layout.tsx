import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasLeagueAccess, leagueOpsEnabled, leagueAiEnabled } from "@/lib/league/access";
import { getLeagueNavData } from "@/lib/league/console";
import { LeagueRail } from "@/features/league/LeagueRail";
import { LeagueMobileNav } from "@/features/league/LeagueMobileNav";

// Always evaluate the gate per-request; never statically render the surface.
export const dynamic = "force-dynamic";

/**
 * Guard for the entire /league surface (Wave 0).
 *
 * Invisible-by-default: a non-member — i.e. every current XO Gridmaker user —
 * gets a 404 here, so the surface and its data are unreachable. The global
 * kill switch (LEAGUE_OPS_ENABLED=off) 404s everyone with no deploy.
 */
export default async function LeagueLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!leagueOpsEnabled()) notFound();
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await hasLeagueAccess())) notFound();

  const { leagues, orgs, activeOrgId } = await getLeagueNavData();
  // No leagues in the active org → the first-run prompt renders clean, no rail.
  if (leagues.length === 0) return <div className="min-h-full">{children}</div>;

  const railLeagues = leagues
    .map((l) => ({ id: l.id, name: l.name, sport: l.sport, location: l.location }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const leoOn = leagueAiEnabled();

  return (
    <div className="md:flex">
      <LeagueRail leagues={railLeagues} leoEnabled={leoOn} orgs={orgs} activeOrgId={activeOrgId} />
      {/* pb on mobile clears the fixed league bottom bar */}
      <div className="min-w-0 flex-1 pb-16 md:pb-0">{children}</div>
      <LeagueMobileNav leagues={railLeagues} leoEnabled={leoOn} orgs={orgs} activeOrgId={activeOrgId} />
    </div>
  );
}

