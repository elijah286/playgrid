"use server";

import { gateLeagueCapability } from "@/lib/league/authorize";
import { getLeagueStripeAccount } from "@/lib/league/payments";

export type Financials = {
  collectedCents: number;
  outstandingCents: number;
  refundedCents: number;
  waivedCents: number;
  paidCount: number;
  unpaidCount: number;
  totalRegistrations: number;
  feeCollectedCents: number;
  addOnCollectedCents: number;
  paymentsEnabled: boolean;
};

const EMPTY: Financials = {
  collectedCents: 0,
  outstandingCents: 0,
  refundedCents: 0,
  waivedCents: 0,
  paidCount: 0,
  unpaidCount: 0,
  totalRegistrations: 0,
  feeCollectedCents: 0,
  addOnCollectedCents: 0,
  paymentsEnabled: false,
};

export async function getFinancialsAction(leagueId: string): Promise<Financials> {
  const gate = await gateLeagueCapability(leagueId, "view_financials");
  if (!gate.ok) return EMPTY;
  const supabase = gate.supabase;

  // Current league-wide fee — fallback for registrations that predate the
  // fee snapshot (fee_cents is null).
  const { data: win } = await supabase
    .from("registration_windows")
    .select("fee_cents")
    .eq("league_id", leagueId)
    .is("division_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const windowFee = (win?.fee_cents as number | null) ?? 0;

  const { data: regs } = await supabase
    .from("player_registrations")
    .select("id, payment_status, fee_cents")
    .eq("league_id", leagueId)
    .limit(10000);
  const rows = regs ?? [];

  const ids = rows.map((r) => r.id as string);
  const addOnByReg = new Map<string, number>();
  // Chunk the id filter so a large league can't blow the URL length / default
  // row cap and silently undercount add-on revenue.
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    const { data: purchases } = await supabase
      .from("league_registration_purchases")
      .select("registration_id, unit_price_cents")
      .in("registration_id", batch)
      .limit(10000);
    for (const p of purchases ?? []) {
      const key = p.registration_id as string;
      addOnByReg.set(key, (addOnByReg.get(key) ?? 0) + ((p.unit_price_cents as number) ?? 0));
    }
  }

  const out: Financials = { ...EMPTY };
  for (const r of rows) {
    out.totalRegistrations += 1;
    const fee = (r.fee_cents as number | null) ?? windowFee;
    const addOn = addOnByReg.get(r.id as string) ?? 0;
    const total = fee + addOn;
    switch (r.payment_status as string) {
      case "paid":
        out.collectedCents += total;
        out.feeCollectedCents += fee;
        out.addOnCollectedCents += addOn;
        out.paidCount += 1;
        break;
      case "unpaid":
        out.outstandingCents += total;
        out.unpaidCount += 1;
        break;
      case "refunded":
        out.refundedCents += total;
        break;
      case "waived":
        out.waivedCents += total;
        break;
      default:
        break;
    }
  }

  const account = await getLeagueStripeAccount(leagueId);
  out.paymentsEnabled = account.chargesEnabled && !!account.accountId;
  return out;
}
