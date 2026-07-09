"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";
import { isLeagueAdmin } from "@/lib/league/access";
import { getStripeClient } from "@/lib/billing/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export type LeaguePaymentStatus = {
  connected: boolean;
  chargesEnabled: boolean;
};

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const auth = await getRequestUser();
  if (auth.kind !== "ok" || !auth.user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const };
}

export async function getPaymentStatusAction(leagueId: string): Promise<LeaguePaymentStatus> {
  const inert = { connected: false, chargesEnabled: false };
  if (!hasSupabaseEnv()) return inert;
  // Don't expose a league's payment-connection state to non-admins.
  if (!(await isLeagueAdmin(leagueId))) return inert;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("leagues")
    .select("stripe_account_id, stripe_charges_enabled")
    .eq("id", leagueId)
    .maybeSingle();
  return {
    connected: !!data?.stripe_account_id,
    chargesEnabled: !!data?.stripe_charges_enabled,
  };
}

/** Create (or reuse) the league's Connect Express account and return an onboarding link. */
export async function startConnectOnboardingAction(
  leagueId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;

  let stripe;
  try {
    ({ stripe } = await getStripeClient());
  } catch {
    return { ok: false, error: "Payments aren't configured on the platform yet." };
  }

  const admin = createServiceRoleClient();
  const { data: league } = await admin
    .from("leagues")
    .select("stripe_account_id, name")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) return { ok: false, error: "League not found." };

  let accountId = (league.stripe_account_id as string | null) ?? null;
  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: { name: (league.name as string) ?? undefined },
        metadata: { league_id: leagueId },
      });
      accountId = account.id;
      await admin.from("leagues").update({ stripe_account_id: accountId }).eq("id", leagueId);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${SITE_URL}/league/${leagueId}/registration?connect=refresh`,
      return_url: `${SITE_URL}/league/${leagueId}/registration?connect=done`,
      type: "account_onboarding",
    });
    return { ok: true, url: link.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start Stripe onboarding." };
  }
}

/** Re-check the connected account and persist whether it can accept charges. */
export async function refreshConnectStatusAction(
  leagueId: string,
): Promise<{ ok: true; chargesEnabled: boolean } | { ok: false; error: string }> {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { data: league } = await admin
    .from("leagues")
    .select("stripe_account_id")
    .eq("id", leagueId)
    .maybeSingle();
  const accountId = (league?.stripe_account_id as string | null) ?? null;
  if (!accountId) return { ok: false, error: "No Stripe account is connected yet." };

  let stripe;
  try {
    ({ stripe } = await getStripeClient());
  } catch {
    return { ok: false, error: "Payments aren't configured on the platform yet." };
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const chargesEnabled = !!account.charges_enabled;
    await admin
      .from("leagues")
      .update({ stripe_charges_enabled: chargesEnabled })
      .eq("id", leagueId);
    revalidatePath(`/league/${leagueId}/registration`);
    return { ok: true, chargesEnabled };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not check Stripe status." };
  }
}
