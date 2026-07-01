import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { resolveLeagueView } from "@/lib/league/authorize";
import { getRosterBoardAction } from "@/app/actions/league-roster";
import { RosterBoard } from "@/features/league/RosterBoard";

export const metadata: Metadata = {
  title: "Rostering · League Console · XO Gridmaker",
};

export default async function RosterPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  // Rostering is an admin-only workspace — gate the page to match the actions
  // so a non-admin member doesn't land on a misleading empty board. A delegated
  // member needs manage_rosters (owners/admins always pass).
  const access = await resolveLeagueView(leagueId, {
    memberAdminOnly: true,
    delegateCapability: "manage_rosters",
  });
  if (!access) notFound();

  const res = await getRosterBoardAction(leagueId);
  const board = res.ok && res.board ? res.board : { teams: [], unrostered: [], waitlistedCount: 0 };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Rostering</h1>
      <p className="mt-1 text-sm text-muted">
        Place approved players onto teams. Approve registrations in the{" "}
        <Link href={`/league/${leagueId}/registration`} className="text-primary hover:underline">
          review queue
        </Link>{" "}
        first — they&apos;ll appear here ready to assign.
      </p>

      <div className="mt-6">
        <RosterBoard leagueId={leagueId} initial={board} />
      </div>
    </div>
  );
}
