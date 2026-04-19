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

export async function updateFormationAction(
  formationId: string,
  name: string,
  players: Player[],
  sportProfile: Partial<SportProfile>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name can't be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Guard: can't update system formations
  const { data: row, error: fetchErr } = await supabase
    .from("formations")
    .select("is_system")
    .eq("id", formationId)
    .single();
  if (fetchErr || !row) return { ok: false, error: fetchErr?.message ?? "Not found." };
  if (row.is_system) return { ok: false, error: "Cannot modify system formations." };

  const params = { displayName: trimmed, players, sportProfile };
  const { error } = await supabase
    .from("formations")
    .update({ params: params as unknown as Record<string, unknown> })
    .eq("id", formationId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function renameFormationAction(
  formationId: string,
  newName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, error: "Name can't be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Fetch current params so we can merge displayName without losing other fields.
  const { data: row, error: fetchErr } = await supabase
    .from("formations")
    .select("params, is_system")
    .eq("id", formationId)
    .single();
  if (fetchErr || !row) return { ok: false, error: fetchErr?.message ?? "Not found." };
  if (row.is_system) return { ok: false, error: "Cannot rename system formations." };

  const updated = { ...(row.params as Record<string, unknown>), displayName: trimmed };
  const { error } = await supabase
    .from("formations")
    .update({ params: updated as unknown as Record<string, unknown> })
    .eq("id", formationId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function duplicateFormationAction(
  formationId: string,
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

  const { data: src, error: fetchErr } = await supabase
    .from("formations")
    .select("params")
    .eq("id", formationId)
    .single();
  if (fetchErr || !src) return { ok: false, error: fetchErr?.message ?? "Not found." };

  const srcParams = src.params as {
    displayName: string;
    players: Player[];
    sportProfile?: Partial<SportProfile>;
  };
  const nextParams = {
    ...srcParams,
    displayName: `${srcParams.displayName} (copy)`,
  };

  const { data, error } = await supabase
    .from("formations")
    .insert({
      team_id: teamId,
      is_system: false,
      semantic_key: `custom_${Date.now()}`,
      params: nextParams as unknown as Record<string, unknown>,
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
