"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getPublicRegistration } from "@/lib/league/public-registration";
import { getLeagueStripeAccount, createRegistrationCheckout } from "@/lib/league/payments";

export type RegistrationSubmission = {
  playerFirstName: string;
  playerLastName: string;
  playerDob: string | null;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  divisionPreference: string;
  notes: string;
  itemIds: string[];
};

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Public (no-auth) registration submission. Runs with the service role and
 * re-validates that registration is open server-side before writing — the
 * page's render-time check is not trusted as the gate.
 */
export async function submitPublicRegistrationAction(
  leagueId: string,
  input: RegistrationSubmission,
): Promise<{ ok: true; checkoutUrl?: string } | { ok: false; error: string }> {
  const data = await getPublicRegistration(leagueId);
  if (!data) return { ok: false, error: "This registration link isn't valid." };
  if (!data.isOpen) return { ok: false, error: "Registration is closed for this league." };

  const first = input.playerFirstName?.trim() ?? "";
  const last = input.playerLastName?.trim() ?? "";
  const guardian = input.guardianName?.trim() ?? "";
  const email = input.guardianEmail?.trim() ?? "";
  if (!first || !last) return { ok: false, error: "Please enter the player's first and last name." };
  if (!guardian) return { ok: false, error: "Please enter a parent/guardian name." };
  if (!isEmail(email)) return { ok: false, error: "Please enter a valid email address." };

  // Required items are always included; optional items only if selected.
  const selected = new Set(input.itemIds ?? []);
  const chosen = data.storeItems.filter((i) => i.required || selected.has(i.id));

  const admin = createServiceRoleClient();
  const applicant = {
    player: { firstName: first, lastName: last, dob: input.playerDob || null },
    guardian: { name: guardian, email, phone: input.guardianPhone?.trim() || null },
    divisionPreference: input.divisionPreference?.trim() || null,
  };

  const { data: reg, error } = await admin
    .from("player_registrations")
    .insert({
      league_id: leagueId,
      status: "submitted",
      payment_status: "unpaid",
      applicant,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !reg) {
    return { ok: false, error: error?.message ?? "We couldn't submit your registration." };
  }

  if (chosen.length > 0) {
    const rows = chosen.map((i) => ({
      registration_id: reg.id as string,
      store_item_id: i.id,
      item_name: i.name,
      unit_price_cents: i.priceCents,
      quantity: 1,
    }));
    await admin.from("league_registration_purchases").insert(rows);
  }

  // If the operator has Stripe enabled and there's a balance due, send the
  // family to hosted checkout. Otherwise the registration stays unpaid and the
  // operator settles offline (the pre-payments behavior).
  const account = await getLeagueStripeAccount(leagueId);
  if (account.chargesEnabled && account.accountId) {
    try {
      const url = await createRegistrationCheckout({
        leagueId,
        registrationId: reg.id as string,
        leagueName: data.leagueName,
        feeCents: data.feeCents,
        items: chosen.map((i) => ({ name: i.name, priceCents: i.priceCents })),
        connectedAccountId: account.accountId,
      });
      if (url) return { ok: true, checkoutUrl: url };
    } catch {
      // Payment setup failed — fall through to unpaid; operator can follow up.
    }
  }

  return { ok: true };
}
