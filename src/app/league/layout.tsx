import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasLeagueAccess, leagueOpsEnabled, leagueAiEnabled } from "@/lib/league/access";
import { getMyLeagues } from "@/lib/league/console";
import { LeagueRail } from "@/features/league/LeagueRail";

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

  const leagues = await getMyLeagues();
  // No leagues yet → the first-run prompt renders clean, no rail.
  if (leagues.length === 0) return <div className="min-h-full">{children}</div>;

  const railLeagues = leagues
    .map((l) => ({ id: l.id, name: l.name, sport: l.sport, location: l.location }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="md:flex">
      <LeagueRail leagues={railLeagues} leoEnabled={leagueAiEnabled()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

