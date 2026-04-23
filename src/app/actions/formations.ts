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
  // Anon visitors viewing a public example have no workspace — return
  // empty rather than failing so downstream lookups degrade gracefully.
  if (!user) return { ok: true, formations: [] };

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

/**
 * Deep-clone a formation into the destination playbook's team.
 * If a formation with the same display name is already visible to the
 * destination playbook, appends " 2" (then " 3", etc.) to avoid collision.
 * Used by the "Copy to playbook" dialog.
 */
export async function copyFormationAction(params: {
  formationId: string;
  destinationPlaybookId: string;
}): Promise<
  | { ok: true; formationId: string; renamed: boolean; newName: string }
  | { ok: false; error: string }
> {
  const { formationId, destinationPlaybookId } = params;
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Destination gate + team/variant
  const { data: destPb, error: destPbErr } = await supabase
    .from("playbooks")
    .select("team_id, sport_variant")
    .eq("id", destinationPlaybookId)
    .single();
  if (destPbErr || !destPb) {
    return { ok: false, error: destPbErr?.message ?? "Destination playbook not found." };
  }
  const { data: destMembership } = await supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", destinationPlaybookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!destMembership || (destMembership.role !== "owner" && destMembership.role !== "editor")) {
    return { ok: false, error: "You don't have permission to add formations to that playbook." };
  }

  // Source
  const { data: src, error: srcErr } = await supabase
    .from("formations")
    .select("params, kind")
    .eq("id", formationId)
    .single();
  if (srcErr || !src) return { ok: false, error: srcErr?.message ?? "Formation not found." };

  const srcParams = src.params as {
    displayName: string;
    players: Player[];
    sportProfile?: Partial<SportProfile>;
  };

  // Existing names visible to destination (dest team's custom formations + system).
  const { data: existing } = await supabase
    .from("formations")
    .select("params")
    .or(`team_id.eq.${destPb.team_id},is_system.eq.true`);
  const existingNames = new Set(
    ((existing ?? []) as Array<{ params: Record<string, unknown> }>)
      .map((r) => (r.params?.displayName as string | undefined)?.trim())
      .filter((n): n is string => !!n),
  );

  const baseName = srcParams.displayName.trim() || "Untitled formation";
  let newName = baseName;
  let renamed = false;
  if (existingNames.has(newName)) {
    renamed = true;
    let i = 2;
    while (existingNames.has(`${baseName} ${i}`)) i += 1;
    newName = `${baseName} ${i}`;
  }

  const nextParams = { ...srcParams, displayName: newName };

  const { data: inserted, error: insErr } = await supabase
    .from("formations")
    .insert({
      team_id: destPb.team_id,
      is_system: false,
      semantic_key: `custom_${Date.now()}`,
      params: nextParams as unknown as Record<string, unknown>,
      kind: (src.kind as string | null) ?? "offense",
    })
    .select("id")
    .single();

  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, formationId: inserted.id as string, renamed, newName };
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

/**
 * Formations visible to a given playbook: every formation whose variant equals
 * the playbook's `sport_variant`, minus rows listed in
 * `playbook_formation_exclusions`. Legacy formations missing a variant default
 * to "flag_7v7" to match the picker's existing fallback.
 */
export async function listFormationsForPlaybookAction(
  playbookId: string,
): Promise<{ ok: true; formations: SavedFormation[] } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  // No auth gate — RLS already scopes formation visibility to the
  // caller's team or public examples.

  const { data: pb, error: pbErr } = await supabase
    .from("playbooks")
    .select("sport_variant, team_id")
    .eq("id", playbookId)
    .single();
  if (pbErr || !pb) return { ok: false, error: pbErr?.message ?? "Playbook not found." };

  const variant = ((pb.sport_variant as string | null) ?? "flag_7v7") as string;
  const teamId = pb.team_id as string;

  // Query formations tied to the playbook's own team (not the caller's
  // default team), plus system formations. This is what lets a coach who
  // was invited into someone else's playbook still see that playbook's
  // custom formations.
  const { data: rows, error: fErr } = await supabase
    .from("formations")
    .select("id, team_id, is_system, params, kind")
    .or(`team_id.eq.${teamId},is_system.eq.true`)
    .order("is_system", { ascending: true });
  if (fErr) return { ok: false, error: fErr.message };

  const { data: excl } = await supabase
    .from("playbook_formation_exclusions")
    .select("formation_id")
    .eq("playbook_id", playbookId);
  const excluded = new Set((excl ?? []).map((r) => r.formation_id as string));

  const formations: SavedFormation[] = (rows ?? [])
    .map((row) => {
      const params = (row.params as {
        displayName?: string;
        players?: Player[];
        sportProfile?: Partial<SportProfile>;
        losY?: number;
      } | null) ?? {};
      return {
        id: row.id as string,
        displayName: params.displayName ?? "Formation",
        players: Array.isArray(params.players) ? params.players : [],
        sportProfile: params.sportProfile ?? {},
        isSystem: Boolean(row.is_system),
        kind: (row.kind as FormationKind) ?? "offense",
        losY: typeof params.losY === "number" ? params.losY : 0.4,
      };
    })
    .filter((f) => {
      const v = (f.sportProfile?.variant as string | undefined) ?? "flag_7v7";
      return v === variant && !excluded.has(f.id);
    });

  return { ok: true, formations };
}

/**
 * For the global formations page's three-dot "Available in playbooks" menu:
 * every playbook whose sport_variant matches this formation's variant, paired
 * with whether the formation is currently excluded from it.
 */
export async function listCompatiblePlaybooksForFormationAction(
  formationId: string,
): Promise<
  | { ok: true; playbooks: Array<{ id: string; name: string; excluded: boolean }> }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: fRow, error: fErr } = await supabase
    .from("formations")
    .select("params")
    .eq("id", formationId)
    .single();
  if (fErr || !fRow) return { ok: false, error: fErr?.message ?? "Formation not found." };

  const params = (fRow.params as { sportProfile?: { variant?: string } } | null) ?? null;
  const variant = params?.sportProfile?.variant ?? "flag_7v7";

  const { data: books, error: pbErr } = await supabase
    .from("playbooks")
    .select("id, name, sport_variant")
    .eq("sport_variant", variant)
    .order("name", { ascending: true });
  if (pbErr) return { ok: false, error: pbErr.message };

  const ids = (books ?? []).map((b) => b.id as string);
  let excluded = new Set<string>();
  if (ids.length > 0) {
    const { data: excl } = await supabase
      .from("playbook_formation_exclusions")
      .select("playbook_id")
      .eq("formation_id", formationId)
      .in("playbook_id", ids);
    excluded = new Set((excl ?? []).map((r) => r.playbook_id as string));
  }

  return {
    ok: true,
    playbooks: (books ?? []).map((b) => ({
      id: b.id as string,
      name: b.name as string,
      excluded: excluded.has(b.id as string),
    })),
  };
}

/**
 * Toggle a formation's availability in a given playbook. `include=false`
 * inserts an exclusion row; `include=true` removes one.
 */
export async function setFormationPlaybookInclusionAction(
  formationId: string,
  playbookId: string,
  include: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (include) {
    const { error } = await supabase
      .from("playbook_formation_exclusions")
      .delete()
      .eq("playbook_id", playbookId)
      .eq("formation_id", formationId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("playbook_formation_exclusions")
      .upsert(
        { playbook_id: playbookId, formation_id: formationId },
        { onConflict: "playbook_id,formation_id" },
      );
    if (error) return { ok: false, error: error.message };
  }
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
