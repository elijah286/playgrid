import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicRegistration } from "@/lib/league/public-registration";
import { PublicRegistrationForm } from "@/features/league/PublicRegistrationForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}): Promise<Metadata> {
  const { leagueId } = await params;
  const data = await getPublicRegistration(leagueId);
  const name = data?.leagueName ?? "League";
  return {
    title: `Register · ${name}`,
    description: `Register a player for ${name}.`,
    robots: { index: false },
  };
}

const CLOSED_COPY: Record<string, string> = {
  not_started: "Registration hasn't opened yet. Check back soon.",
  ended: "Registration has closed for this season.",
  closed: "Registration isn't open right now.",
};

export default async function PublicRegisterPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const data = await getPublicRegistration(leagueId);
  if (!data) notFound();

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-10 text-foreground sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Player registration</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{data.leagueName}</h1>
      </div>

      {data.isOpen ? (
        <PublicRegistrationForm
          leagueId={data.leagueId}
          leagueName={data.leagueName}
          feeCents={data.feeCents}
          storeItems={data.storeItems}
          paymentsEnabled={data.paymentsEnabled}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-surface-raised p-8 text-center">
          <p className="text-sm text-muted">
            {CLOSED_COPY[data.closedReason ?? "closed"] ?? CLOSED_COPY.closed}
          </p>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-muted">Powered by XO Gridmaker</p>
    </main>
  );
}
