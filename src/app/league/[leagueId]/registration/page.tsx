import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { getCurrentLeagueMemberships } from "@/lib/league/access";
import { getRegistrationConfigAction } from "@/app/actions/league-registration-config";
import { listStoreItemsAction } from "@/app/actions/league-store";
import { RegistrationSettings } from "@/features/league/RegistrationSettings";
import { StoreItemsManager } from "@/features/league/StoreItemsManager";
import { ShareRegistrationLink } from "@/features/league/ShareRegistrationLink";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export const metadata: Metadata = {
  title: "Registration · League Console · XO Gridmaker",
};

export default async function RegistrationPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId)) notFound();

  const registerUrl = `${SITE_URL}/register/${leagueId}`;
  const [config, store, qrDataUrl] = await Promise.all([
    getRegistrationConfigAction(leagueId),
    listStoreItemsAction(leagueId),
    QRCode.toDataURL(registerUrl, { width: 264, margin: 1 }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Registration</h1>
      <p className="mt-1 text-sm text-muted">
        Configure registration, share your sign-up link, and set what families can buy.
      </p>

      <h2 className="mb-2 mt-7 text-sm font-semibold">Share with families</h2>
      <ShareRegistrationLink url={registerUrl} qrDataUrl={qrDataUrl} />

      <h2 className="mb-2 mt-8 text-sm font-semibold">Settings</h2>
      <RegistrationSettings leagueId={leagueId} initial={config} />

      <h2 className="mb-2 mt-8 text-sm font-semibold">Store items</h2>
      <p className="mb-3 text-xs text-muted">
        Jerseys, equipment, or add-on fees families can purchase during registration.
      </p>
      <StoreItemsManager leagueId={leagueId} initialItems={store.ok ? store.items : []} />
    </div>
  );
}
