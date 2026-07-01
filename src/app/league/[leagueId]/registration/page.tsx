import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { resolveLeagueView } from "@/lib/league/authorize";
import { getRegistrationConfigAction } from "@/app/actions/league-registration-config";
import { listRegistrationsAction } from "@/app/actions/league-registrations";
import { getPaymentStatusAction } from "@/app/actions/league-payments";
import { RegistrationSettings } from "@/features/league/RegistrationSettings";
import { ShareRegistrationLink } from "@/features/league/ShareRegistrationLink";
import { RegistrationsReview } from "@/features/league/RegistrationsReview";
import { PaymentsConnect } from "@/features/league/PaymentsConnect";

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

  const access = await resolveLeagueView(leagueId, {
    delegateCapability: "manage_registration",
  });
  if (!access) notFound();

  // Prefer the custom slug (set in Settings) for a short, shareable link. Read via
  // the authorized client so a delegated member isn't blocked by RLS.
  const { data: leagueRow } = await access.db
    .from("leagues")
    .select("slug")
    .eq("id", leagueId)
    .maybeSingle();
  const slug = (leagueRow?.slug as string | null) ?? null;
  const registerUrl = `${SITE_URL}/register/${slug ?? leagueId}`;
  const [config, registrations, paymentStatus, qrDataUrl] = await Promise.all([
    getRegistrationConfigAction(leagueId),
    listRegistrationsAction(leagueId),
    getPaymentStatusAction(leagueId),
    QRCode.toDataURL(registerUrl, { width: 264, margin: 1 }),
  ]);
  const regItems = registrations.ok ? registrations.items : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Registration</h1>
      <p className="mt-1 text-sm text-muted">
        Configure registration and share your sign-up link with families.
      </p>

      <h2 className="mb-2 mt-7 text-sm font-semibold">Share with families</h2>
      <ShareRegistrationLink url={registerUrl} qrDataUrl={qrDataUrl} />

      <h2 className="mb-2 mt-8 text-sm font-semibold">
        Registrations{regItems.length > 0 ? ` (${regItems.length})` : ""}
      </h2>
      <RegistrationsReview
        leagueId={leagueId}
        initialItems={regItems}
        paymentsEnabled={paymentStatus.chargesEnabled}
      />

      <h2 className="mb-2 mt-8 text-sm font-semibold">Settings</h2>
      <RegistrationSettings leagueId={leagueId} initial={config} />

      <h2 className="mb-2 mt-8 text-sm font-semibold">Payments</h2>
      <PaymentsConnect leagueId={leagueId} initial={paymentStatus} />

      <h2 className="mb-2 mt-8 text-sm font-semibold">Store items</h2>
      <p className="text-xs text-muted">
        Jerseys, equipment, and add-on fees now live on the{" "}
        <Link href={`/league/${leagueId}/store`} className="text-primary hover:underline">
          Store
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
