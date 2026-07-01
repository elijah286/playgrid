"use server";

import { revalidatePath } from "next/cache";

import { hasSupabaseEnv } from "@/lib/supabase/config";
import { gateLeagueCapability, resolveLeagueView } from "@/lib/league/authorize";

export type RegistrationConfig = {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  feeCents: number;
};

const DEFAULTS: RegistrationConfig = {
  isOpen: false,
  opensAt: null,
  closesAt: null,
  feeCents: 0,
};

/** The league-wide registration window (division_id is null) acts as the config. */
export async function getRegistrationConfigAction(leagueId: string): Promise<RegistrationConfig> {
  if (!hasSupabaseEnv()) return DEFAULTS;
  // Grant-aware read: a member reads via RLS; a delegated member with
  // manage_registration reads via the service role.
  const access = await resolveLeagueView(leagueId, {
    delegateCapability: "manage_registration",
  });
  if (!access) return DEFAULTS;
  const supabase = access.db;
  const { data } = await supabase
    .from("registration_windows")
    .select("is_open, opens_at, closes_at, fee_cents")
    .eq("league_id", leagueId)
    .is("division_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return {
    isOpen: !!data.is_open,
    opensAt: (data.opens_at as string | null) ?? null,
    closesAt: (data.closes_at as string | null) ?? null,
    feeCents: (data.fee_cents as number) ?? 0,
  };
}

export async function upsertRegistrationConfigAction(
  leagueId: string,
  input: { isOpen: boolean; opensAt?: string | null; closesAt?: string | null; feeCents: number },
) {
  const gate = await gateLeagueCapability(leagueId, "manage_registration");
  if (!gate.ok) return gate;
  const supabase = gate.supabase;

  const fields = {
    is_open: input.isOpen,
    opens_at: input.opensAt || null,
    closes_at: input.closesAt || null,
    fee_cents: Math.max(0, Math.trunc(input.feeCents || 0)),
  };

  const { data: existing } = await supabase
    .from("registration_windows")
    .select("id")
    .eq("league_id", leagueId)
    .is("division_id", null)
    // Match the readers (getRegistrationConfig / getPublicRegistration), which
    // both order by created_at asc — so the writer always edits the same row
    // they consume. A unique index now prevents duplicates from forming.
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("registration_windows")
      .update(fields)
      .eq("id", existing.id as string);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase
      .from("registration_windows")
      .insert({ league_id: leagueId, division_id: null, name: "Registration", ...fields });
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}
