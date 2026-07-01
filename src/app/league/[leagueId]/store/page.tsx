import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { resolveLeagueView } from "@/lib/league/authorize";
import { listStoreItemsAction } from "@/app/actions/league-store";
import { StoreItemsManager } from "@/features/league/StoreItemsManager";

export const metadata: Metadata = {
  title: "Store · League Console · XO Gridmaker",
};

export default async function LeagueStorePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  // Its own destination so a delegated merch manager (manage_store, no
  // manage_registration) has somewhere to go — the store used to live inside the
  // registration page and was unreachable for them.
  const access = await resolveLeagueView(leagueId, { delegateCapability: "manage_store" });
  if (!access) notFound();

  const store = await listStoreItemsAction(leagueId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Store</h1>
      <p className="mt-1 text-sm text-muted">
        Jerseys, equipment, or add-on fees families can purchase during registration.
      </p>

      <div className="mt-6">
        <StoreItemsManager leagueId={leagueId} initialItems={store.ok ? store.items : []} />
      </div>
    </div>
  );
}
