// Core playbook-creation logic, callable from both server actions and
// from non-action server contexts (Coach AI tool handler in an API route).
//
// The Coach AI tool used to call createPlaybookAction via require() to
// re-use the action's logic. In Next.js 16 / Turbopack that pattern
// returned a stub that didn't actually execute the insert — Coach Cal
// would say "Playbook created!" with a link, but no row was ever
// written to the database. Extracting the logic here gives every caller
// a single, plainly-callable async function with no 'use server'
// indirection.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultSettingsForVariant,
  type PlaybookSettings,
} from "@/domain/playbook/settings";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import {
  FREE_MAX_PLAYBOOKS_OWNED,
  tierAtLeast,
} from "@/lib/billing/features";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import type { SportVariant } from "@/domain/play/types";

export type CreatePlaybookInput = {
  name: string;
  sportVariant?: SportVariant;
  color?: string | null;
  logoUrl?: string | null;
  customOffenseCount?: number | null;
  season?: string | null;
  settings?: PlaybookSettings | null;
};

export type CreatePlaybookResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Create a playbook for the currently signed-in user. The supabase
 *  client passed in must already be authenticated (cookies-bound for a
 *  user, or service-role for system contexts). */
export async function createPlaybookForUser(
  supabase: SupabaseClient,
  input: CreatePlaybookInput,
): Promise<CreatePlaybookResult> {
  const name = input.name?.trim().slice(0, 80) ?? "";
  if (!name) return { ok: false, error: "Playbook name is required." };

  const sportVariant: SportVariant = input.sportVariant ?? "flag_7v7";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const entitlement = await getUserEntitlement(user.id);
  if (!tierAtLeast(entitlement, "coach")) {
    const { count: ownedCount } = await supabase
      .from("playbook_members")
      .select("playbook_id, playbooks!inner(id)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("playbooks.is_default", false);
    if ((ownedCount ?? 0) >= FREE_MAX_PLAYBOOKS_OWNED) {
      return {
        ok: false,
        error: `Free tier is limited to ${FREE_MAX_PLAYBOOKS_OWNED} playbook. Upgrade to Team Coach to create more.`,
      };
    }
  }

  const color = input.color?.trim() || null;
  const logo = input.logoUrl?.trim() || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { ok: false, error: "Color must be a hex like #RRGGBB." };
  }
  if (logo && !/^https?:\/\//i.test(logo)) {
    return { ok: false, error: "Logo must be an http(s) URL." };
  }

  let offenseCount: number | null = null;
  if (sportVariant === "other" && typeof input.customOffenseCount === "number") {
    const n = Math.round(input.customOffenseCount);
    if (!Number.isFinite(n) || n < 4 || n > 11) {
      return { ok: false, error: "Player count must be between 4 and 11." };
    }
    offenseCount = n;
  }

  let teamId: string;
  try {
    const ws = await ensureDefaultWorkspace(supabase, user.id);
    teamId = ws.teamId;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not resolve workspace.",
    };
  }

  const seasonClean = input.season?.trim().slice(0, 60) || null;
  const resolvedSettings =
    input.settings ?? defaultSettingsForVariant(sportVariant, offenseCount);

  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      team_id: teamId,
      name,
      sport_variant: sportVariant,
      color,
      logo_url: logo,
      custom_offense_count: offenseCount,
      season: seasonClean,
      settings: resolvedSettings,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "Insert returned no row id." };

  const { error: memberErr } = await supabase
    .from("playbook_members")
    .insert({ playbook_id: data.id, user_id: user.id, role: "owner" });
  // Failure here would orphan the playbook — surface it instead of silent.
  if (memberErr) return { ok: false, error: `Membership insert failed: ${memberErr.message}` };

  // Clone seed formations matching this variant.
  const { data: seeds } = await supabase
    .from("formations")
    .select("params, kind")
    .eq("is_seed", true);
  if (seeds && seeds.length > 0) {
    const rows = seeds
      .filter((s) => {
        const p = s.params as { sportProfile?: { variant?: string } } | null;
        const v = p?.sportProfile?.variant ?? "flag_7v7";
        return v === sportVariant;
      })
      .map((s) => ({
        playbook_id: data.id,
        is_seed: false,
        semantic_key: `seeded_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        params: s.params,
        kind: (s.kind as string | null) ?? "offense",
      }));
    if (rows.length > 0) {
      await supabase.from("formations").insert(rows);
    }
  }

  // Verify the row is actually visible — guards against any phantom-insert
  // path. If we can't read it back, treat the create as failed.
  const { data: verify, error: verifyErr } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", data.id)
    .single();
  if (verifyErr || !verify?.id) {
    return { ok: false, error: "Playbook insert could not be verified." };
  }

  return { ok: true, id: data.id };
}
