import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/billing/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

/** Platform application fee in basis points (500 = 5%). Site-admin configurable. */
export async function getLeaguePlatformFeeBps(): Promise<number> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("site_settings")
    .select("league_platform_fee_bps")
    .eq("id", "default")
    .maybeSingle();
  const bps = data?.league_platform_fee_bps;
  return typeof bps === "number" && bps >= 0 ? bps : 0;
}

export async function getLeagueStripeAccount(
  leagueId: string,
): Promise<{ accountId: string | null; chargesEnabled: boolean }> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("leagues")
    .select("stripe_account_id, stripe_charges_enabled")
    .eq("id", leagueId)
    .maybeSingle();
  return {
    accountId: (data?.stripe_account_id as string | null) ?? null,
    chargesEnabled: !!data?.stripe_charges_enabled,
  };
}

/**
 * Create a Stripe Checkout Session for a registration as a destination charge:
 * the charge is on the platform account, funds transfer to the operator's
 * connected account, and the platform keeps an application fee. Returns the
 * hosted checkout URL, or null if there's nothing to charge.
 */
export async function createRegistrationCheckout(opts: {
  leagueId: string;
  registrationId: string;
  leagueName: string;
  feeCents: number;
  items: { name: string; priceCents: number }[];
  connectedAccountId: string;
}): Promise<string | null> {
  const total = opts.feeCents + opts.items.reduce((s, i) => s + i.priceCents, 0);
  if (total <= 0) return null;

  const { stripe } = await getStripeClient();
  const feeBps = await getLeaguePlatformFeeBps();
  const applicationFee = Math.round((total * feeBps) / 10000);

  const lineItems: {
    price_data: { currency: string; unit_amount: number; product_data: { name: string } };
    quantity: number;
  }[] = [];
  if (opts.feeCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        unit_amount: opts.feeCents,
        product_data: { name: `${opts.leagueName} registration` },
      },
      quantity: 1,
    });
  }
  for (const i of opts.items) {
    if (i.priceCents > 0) {
      lineItems.push({
        price_data: { currency: "usd", unit_amount: i.priceCents, product_data: { name: i.name } },
        quantity: 1,
      });
    }
  }
  if (lineItems.length === 0) return null;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    payment_intent_data: {
      application_fee_amount: applicationFee,
      transfer_data: { destination: opts.connectedAccountId },
    },
    success_url: `${SITE_URL}/register/${opts.leagueId}?paid=1`,
    cancel_url: `${SITE_URL}/register/${opts.leagueId}?canceled=1`,
    metadata: {
      kind: "league_registration",
      registration_id: opts.registrationId,
      league_id: opts.leagueId,
    },
  });

  const admin = createServiceRoleClient();
  await admin
    .from("player_registrations")
    .update({ stripe_session_id: session.id })
    .eq("id", opts.registrationId);

  return session.url;
}
