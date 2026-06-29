import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCurrentLeagueMemberships,
  isLeagueAdminRole,
  leagueAiEnabled,
} from "@/lib/league/access";
import { LeoChat } from "@/features/league/LeoChat";

export const metadata: Metadata = {
  title: "Leo · League Console · XO Gridmaker",
};

export default async function LeoPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  // Dark by default; operator-only.
  if (!leagueAiEnabled()) notFound();
  const memberships = await getCurrentLeagueMemberships();
  const membership = memberships.find((m) => m.leagueId === leagueId);
  if (!membership || !isLeagueAdminRole(membership.role)) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Leo</h1>
        <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] font-medium text-muted">
          Beta
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Your league assistant. Read-only for now — it can look things up and draft
        messages, but can&apos;t send or change anything yet.
      </p>

      <div className="mt-5">
        <LeoChat leagueId={leagueId} />
      </div>

      <p className="mt-3 text-center text-[11px] text-muted">
        Leo can make mistakes — double-check important details.
      </p>
    </div>
  );
}
