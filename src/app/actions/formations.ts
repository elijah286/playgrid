"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import type { Player, SportProfile } from "@/domain/play/types";

export type SavedFormation = {
  id: string;
  displayName: string;
  players: Player[];
  sportProfile: Partial<SportProfile>;
  isSystem: boolean;
};

export async function listFormationsAction(): Promise<
  { ok: true; formations: SavedFormation[] } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let teamId: string | undefined;
  try {
    const ws = await ensureDefaultWorkspace(supabase, user.id);
    teamId = ws.teamId;
  } catch {
    return { ok: false, error: "Could not resolve workspace." };
  }

  const { data, error } = await supabase
    .from("formations")
    .select("id, team_id, is_system, params")
    .or(`team_id.eq.${teamId},is_system.eq.true`)
    .order("is_system", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const formations: SavedFormation[] = (data ?? [])
    .filter((row) => {
      const p = row.params as Record<string, unknown> | null;
      return p && Array.isArray(p.players) && typeof p.displayName === "string";
    })
    .map((row) => {
      const p = row.params as {
        displayName: string;
        players: Player[];
        sportProfile?: Partial<SportProfile>;
      };
      return {
        id: row.id as string,
        displayName: p.displayName,
        players: p.players,
        sportProfile: p.sportProfile ?? {},
        isSystem: Boolean(row.is_system),
      };
    });

  return { ok: true, formations };
}

export async function saveFormationAction(
  name: string,
  players: Player[],
  sportProfile: Partial<SportProfile>,
): Promise<{ ok: true; formationId: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let teamId: string | undefined;
  try {
    const ws = await ensureDefaultWorkspace(supabase, user.id);
    teamId = ws.teamId;
  } catch {
    return { ok: false, error: "Could not resolve workspace." };
  }

  const params = { displayName: name, players, sportProfile };

  const { data, error } = await supabase
    .from("formations")
    .insert({
      team_id: teamId,
      is_system: false,
      semantic_key: `custom_${Date.now()}`,
      params: params as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, formationId: data.id as string };
}

export async function deleteFormationAction(
  formationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("formations")
    .delete()
    .eq("id", formationId);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
