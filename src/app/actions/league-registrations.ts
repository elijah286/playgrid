"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";

export type RegistrationStatus =
  | "submitted"
  | "approved"
  | "rostered"
  | "waitlisted"
  | "rejected"
  | "withdrawn";

export type RegistrationListItem = {
  id: string;
  status: RegistrationStatus;
  paymentStatus: string;
  submittedAt: string;
  notes: string | null;
  player: { firstName: string; lastName: string; dob: string | null };
  guardian: { name: string; email: string; phone: string | null };
  divisionPreference: string | null;
  sportDetails: Record<string, string>;
  purchases: { name: string; priceCents: number }[];
};

function readApplicant(applicant: unknown) {
  const a = (applicant ?? {}) as Record<string, unknown>;
  const player = (a.player ?? {}) as Record<string, unknown>;
  const guardian = (a.guardian ?? {}) as Record<string, unknown>;
  return {
    player: {
      firstName: typeof player.firstName === "string" ? player.firstName : "",
      lastName: typeof player.lastName === "string" ? player.lastName : "",
      dob: typeof player.dob === "string" ? player.dob : null,
    },
    guardian: {
      name: typeof guardian.name === "string" ? guardian.name : "",
      email: typeof guardian.email === "string" ? guardian.email : "",
      phone: typeof guardian.phone === "string" ? guardian.phone : null,
    },
    divisionPreference:
      typeof a.divisionPreference === "string" ? a.divisionPreference : null,
    sportDetails:
      a.sportDetails && typeof a.sportDetails === "object"
        ? Object.fromEntries(
            Object.entries(a.sportDetails as Record<string, unknown>).filter(
              ([, v]) => typeof v === "string" && v,
            ) as [string, string][],
          )
        : {},
  };
}

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const, supabase };
}

export async function listRegistrationsAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, items: [] as RegistrationListItem[] };

  const { data: regs, error } = await gate.supabase
    .from("player_registrations")
    .select("id, status, payment_status, applicant, notes, submitted_at")
    .eq("league_id", leagueId)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false as const, error: error.message, items: [] as RegistrationListItem[] };

  const ids = (regs ?? []).map((r) => r.id as string);
  const purchasesByReg = new Map<string, { name: string; priceCents: number }[]>();
  if (ids.length > 0) {
    const { data: purchases } = await gate.supabase
      .from("league_registration_purchases")
      .select("registration_id, item_name, unit_price_cents")
      .in("registration_id", ids);
    for (const p of purchases ?? []) {
      const key = p.registration_id as string;
      const list = purchasesByReg.get(key) ?? [];
      list.push({ name: p.item_name as string, priceCents: (p.unit_price_cents as number) ?? 0 });
      purchasesByReg.set(key, list);
    }
  }

  const items: RegistrationListItem[] = (regs ?? []).map((r) => {
    const a = readApplicant(r.applicant);
    return {
      id: r.id as string,
      status: r.status as RegistrationStatus,
      paymentStatus: (r.payment_status as string) ?? "unpaid",
      submittedAt: r.submitted_at as string,
      notes: (r.notes as string | null) ?? null,
      player: a.player,
      guardian: a.guardian,
      divisionPreference: a.divisionPreference,
      sportDetails: a.sportDetails,
      purchases: purchasesByReg.get(r.id as string) ?? [],
    };
  });
  return { ok: true as const, items };
}

const ALLOWED: RegistrationStatus[] = [
  "submitted",
  "approved",
  "waitlisted",
  "rejected",
  "withdrawn",
];

export async function updateRegistrationStatusAction(
  leagueId: string,
  id: string,
  status: RegistrationStatus,
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  if (!ALLOWED.includes(status)) return { ok: false as const, error: "Invalid status." };
  const { error } = await gate.supabase
    .from("player_registrations")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}
