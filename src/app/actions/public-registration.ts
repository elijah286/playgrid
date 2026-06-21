"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
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

function cap(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
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

  // Abuse control on this anonymous, service-role write path.
  const ip = await clientIp();
  const withinBudget =
    (await rateLimit(`league-reg-ip:${ip}`, { windowSeconds: 3600, max: 20 })) &&
    (await rateLimit(`league-reg-league:${leagueId}`, { windowSeconds: 60, max: 30 }));
  if (!withinBudget) {
    return {
      ok: false,
      error: "Too many registration attempts right now. Please wait a minute and try again.",
    };
  }

  const first = cap(input.playerFirstName?.trim() ?? "", 80);
  const last = cap(input.playerLastName?.trim() ?? "", 80);
  const guardian = cap(input.guardianName?.trim() ?? "", 120);
  const email = cap(input.guardianEmail?.trim() ?? "", 160);
  const phone = cap(input.guardianPhone?.trim() ?? "", 40);
  const divisionPreference = cap(input.divisionPreference?.trim() ?? "", 80);
  const notes = cap(input.notes?.trim() ?? "", 2000);
  if (!first || !last) return { ok: false, error: "Please enter the player's first and last name." };
  if (!guardian) return { ok: false, error: "Please enter a parent/guardian name." };
  if (!isEmail(email)) return { ok: false, error: "Please enter a valid email address." };

  // Required items are always included; optional items only if selected.
  const selected = new Set(input.itemIds ?? []);
  const chosen = data.storeItems.filter((i) => i.required || selected.has(i.id));

  const admin = createServiceRoleClient();
  const applicant = {
    player: { firstName: first, lastName: last, dob: input.playerDob || null },
    guardian: { name: guardian, email, phone: phone || null },
    divisionPreference: divisionPreference || null,
  };

  // Idempotency: a double-submit / action retry should reuse the existing
  // registration rather than insert a duplicate (and double-charge). Match a
  // recent submission for the same league + guardian email + player name.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("player_registrations")
    .select("id, applicant, payment_status")
    .eq("league_id", leagueId)
    .gte("submitted_at", tenMinAgo)
    .order("submitted_at", { ascending: false })
    .limit(50);
  const dup = (recent ?? []).find((r) => {
    const a = (r.applicant ?? {}) as {
      guardian?: { email?: unknown };
      player?: { firstName?: unknown; lastName?: unknown };
    };
    return (
      typeof a.guardian?.email === "string" &&
      a.guardian.email.toLowerCase() === email.toLowerCase() &&
      typeof a.player?.firstName === "string" &&
      a.player.firstName.toLowerCase() === first.toLowerCase() &&
      typeof a.player?.lastName === "string" &&
      a.player.lastName.toLowerCase() === last.toLowerCase()
    );
  });

  let registrationId: string;
  if (dup) {
    if ((dup.payment_status as string) === "paid") return { ok: true };
    registrationId = dup.id as string;
  } else {
    const { data: reg, error } = await admin
      .from("player_registrations")
      .insert({
        league_id: leagueId,
        status: "submitted",
        payment_status: "unpaid",
        applicant,
        notes: notes || null,
      })
      .select("id")
      .single();
    if (error || !reg) {
      return { ok: false, error: error?.message ?? "We couldn't submit your registration." };
    }
    registrationId = reg.id as string;

    if (chosen.length > 0) {
      const rows = chosen.map((i) => ({
        registration_id: registrationId,
        store_item_id: i.id,
        item_name: i.name,
        unit_price_cents: i.priceCents,
        quantity: 1,
      }));
      await admin.from("league_registration_purchases").insert(rows);
    }
  }

  // If the operator has Stripe enabled and there's a balance due, send the
  // family to hosted checkout. Otherwise the registration stays unpaid and the
  // operator settles offline (the pre-payments behavior).
  const account = await getLeagueStripeAccount(leagueId);
  if (account.chargesEnabled && account.accountId) {
    try {
      const url = await createRegistrationCheckout({
        leagueId,
        registrationId,
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
