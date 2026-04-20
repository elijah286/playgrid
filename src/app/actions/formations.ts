"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import type { PlayType, Player, SportProfile } from "@/domain/play/types";

export type FormationKind = PlayType; // "offense" | "defense" | "special_teams"

export type SavedFormation = {
  id: string;
  displayName: string;
  players: Player[];
  sportProfile: Partial<SportProfile>;
  isSystem: boolean;
  kind: FormationKind;
  /**
   * The lineOfScrimmageY that was active when this formation was saved.
   * Used to convert stored player positions to yards-from-LOS for drift
   * detection and reapply coordinate transforms.  Defaults to 0.4 for
   * formations saved before this field was introduced.
   */
  losY: number;
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
    .select("id, team_id, is_system, params, kind")
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
        lineOfScrimmageY?: number;
      };
      return {
        id: row.id as string,
        displayName: p.displayName,
        players: p.players,
        sportProfile: p.sportProfile ?? {},
        isSystem: Boolean(row.is_system),
        kind: ((row.kind as FormationKind | null) ?? "offense") as FormationKind,
        losY: typeof p.lineOfScrimmageY === "number" ? p.lineOfScrimmageY : 0.4,
      };
    });

  return { ok: true, formations };
}

export async function saveFormationAction(
  name: string,
  players: Player[],
  sportProfile: Partial<SportProfile>,
  losY = 0.4,
  kind: FormationKind = "offense",
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

  const params = { displayName: name, players, sportProfile, lineOfScrimmageY: losY };

  const { data, error } = await supabase
    .from("formations")
    .insert({
      team_id: teamId,
      is_system: false,
      semantic_key: `custom_${Date.now()}`,
      params: params as unknown as Record<string, unknown>,
      kind,
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
  losY = 0.4,
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

  const params = { displayName: trimmed, players, sportProfile, lineOfScrimmageY: losY };
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

export async function countLinkedPlaysAction(
  formationId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { count, error } = await supabase
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("formation_id", formationId)
    .is("formation_tag", null); // exclude intentionally-tagged plays

  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

/**
 * Update a formation and optionally propagate player position changes to
 * all linked plays that have no formation tag (untagged = still using the
 * base formation).
 */
export async function updateFormationAndPropagateAction(
  formationId: string,
  name: string,
  players: Player[],
  sportProfile: Partial<SportProfile>,
  propagate: boolean,
): Promise<{ ok: true; updatedPlays: number } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };

  // First update the formation itself
  const updateRes = await updateFormationAction(formationId, name, players, sportProfile);
  if (!updateRes.ok) return updateRes;

  if (!propagate) return { ok: true, updatedPlays: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Find all play_versions for plays linked to this formation (no tag)
  const { data: linkedPlays } = await supabase
    .from("plays")
    .select("id, current_version_id")
    .eq("formation_id", formationId)
    .is("formation_tag", null);

  if (!linkedPlays || linkedPlays.length === 0) return { ok: true, updatedPlays: 0 };

  const versionIds = linkedPlays
    .map((p) => p.current_version_id as string | null)
    .filter((id): id is string => typeof id === "string");

  if (versionIds.length === 0) return { ok: true, updatedPlays: 0 };

  const { data: versions } = await supabase
    .from("play_versions")
    .select("id, play_id, document")
    .in("id", versionIds);

  let updatedPlays = 0;
  for (const ver of versions ?? []) {
    const doc = ver.document as import("@/domain/play/types").PlayDocument;
    if (!doc) continue;

    // Replace player positions from the updated formation, matching by player id
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const updatedPlayers = doc.layers.players.map((p) => {
      const fp = playerMap.get(p.id);
      return fp ? { ...p, position: fp.position } : p;
    });

    const updatedDoc = {
      ...doc,
      layers: { ...doc.layers, players: updatedPlayers },
    };

    const { data: newVer } = await supabase
      .from("play_versions")
      .insert({
        play_id: ver.play_id,
        schema_version: 1,
        document: updatedDoc as unknown as Record<string, unknown>,
        parent_version_id: ver.id,
        label: `formation updated`,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (newVer) {
      await supabase
        .from("plays")
        .update({ current_version_id: newVer.id })
        .eq("id", ver.play_id);
      updatedPlays++;
    }
  }

  return { ok: true, updatedPlays };
}
