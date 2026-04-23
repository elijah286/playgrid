"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { PlayType, Player, SportProfile } from "@/domain/play/types";

export type FormationKind = PlayType; // "offense" | "defense" | "special_teams"

export type SavedFormation = {
  id: string;
  displayName: string;
  players: Player[];
  sportProfile: Partial<SportProfile>;
  kind: FormationKind;
  /**
   * The lineOfScrimmageY that was active when this formation was saved.
   * Used to convert stored player positions to yards-from-LOS for drift
   * detection and reapply coordinate transforms.  Defaults to 0.4 for
   * formations saved before this field was introduced.
   */
  losY: number;
  /** The playbook this formation belongs to. null only for seed templates. */
  playbookId: string | null;
  /** Populated on list queries that join playbooks for display. */
  playbookName?: string;
  /** Seeds are admin-managed templates cloned into new playbooks. */
  isSeed: boolean;
};

type FormationParams = {
  displayName: string;
  players: Player[];
  sportProfile?: Partial<SportProfile>;
  lineOfScrimmageY?: number;
};

function rowToFormation(row: {
  id: string;
  playbook_id: string | null;
  is_seed: boolean;
  params: FormationParams | Record<string, unknown> | null;
  kind: string | null;
  playbooks?: { name: string } | null;
}): SavedFormation {
  const params = (row.params ?? {}) as FormationParams;
  return {
    id: row.id,
    displayName: params.displayName ?? "Formation",
    players: Array.isArray(params.players) ? params.players : [],
    sportProfile: params.sportProfile ?? {},
    kind: (row.kind as FormationKind | null) ?? "offense",
    losY: typeof params.lineOfScrimmageY === "number" ? params.lineOfScrimmageY : 0.4,
    playbookId: row.playbook_id,
    playbookName: row.playbooks?.name,
    isSeed: Boolean(row.is_seed),
  };
}

/**
 * Every formation the current user can see across their playbooks. Seeds are
 * excluded — they are admin-only templates cloned into new playbooks on
 * creation.
 */
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
  if (!user) return { ok: true, formations: [] };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  // Admins see seeds inline alongside playbook formations so they can manage
  // the seed pool from the same view. Non-admins only ever see playbook-scoped
  // rows. The left-join on playbooks keeps seeds (playbook_id = null) visible.
  const query = supabase
    .from("formations")
    .select(
      isAdmin
        ? "id, playbook_id, is_seed, params, kind, playbooks(name)"
        : "id, playbook_id, is_seed, params, kind, playbooks!inner(name)",
    );
  const { data, error } = await (isAdmin ? query : query.eq("is_seed", false));
  if (error) return { ok: false, error: error.message };

  const formations = (data ?? [])
    .map((row) =>
      rowToFormation({
        ...row,
        playbooks: Array.isArray(row.playbooks) ? row.playbooks[0] : row.playbooks,
      }),
    )
    .filter((f) => f.players.length > 0 || f.displayName !== "Formation");

  return { ok: true, formations };
}

/**
 * Seeds-only list, for the site admin UI. Non-admins see an empty array
 * (RLS actually allows reading seeds but we double-gate on is_seed here so
 * regular flows never surface them).
 */
export async function listSeedFormationsAction(): Promise<
  { ok: true; formations: SavedFormation[] } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: true, formations: [] };

  const { data, error } = await supabase
    .from("formations")
    .select("id, playbook_id, is_seed, params, kind")
    .eq("is_seed", true);
  if (error) return { ok: false, error: error.message };

  return { ok: true, formations: (data ?? []).map((row) => rowToFormation(row)) };
}

export async function saveFormationAction(
  name: string,
  players: Player[],
  sportProfile: Partial<SportProfile>,
  losY = 0.4,
  kind: FormationKind = "offense",
  playbookId?: string | null,
): Promise<{ ok: true; formationId: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  if (!playbookId) {
    return { ok: false, error: "Pick a playbook for this formation." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const params: FormationParams = {
    displayName: name,
    players,
    sportProfile,
    lineOfScrimmageY: losY,
  };

  const { data, error } = await supabase
    .from("formations")
    .insert({
      playbook_id: playbookId,
      is_seed: false,
      semantic_key: `custom_${Date.now()}`,
      params: params as unknown as Record<string, unknown>,
      kind,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, formationId: data.id as string };
}

/**
 * Create the same formation in multiple playbooks at once. Returns per-
 * playbook results so the caller can surface partial failures.
 */
export async function saveFormationInPlaybooksAction(
  name: string,
  players: Player[],
  sportProfile: Partial<SportProfile>,
  losY: number,
  kind: FormationKind,
  playbookIds: string[],
): Promise<
  | { ok: true; created: Array<{ playbookId: string; formationId: string }>; errors: Array<{ playbookId: string; error: string }> }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  if (playbookIds.length === 0) return { ok: false, error: "Pick at least one playbook." };

  const created: Array<{ playbookId: string; formationId: string }> = [];
  const errors: Array<{ playbookId: string; error: string }> = [];
  for (const pbId of playbookIds) {
    const res = await saveFormationAction(name, players, sportProfile, losY, kind, pbId);
    if (res.ok) created.push({ playbookId: pbId, formationId: res.formationId });
    else errors.push({ playbookId: pbId, error: res.error });
  }
  return { ok: true, created, errors };
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

  const params: FormationParams = {
    displayName: trimmed,
    players,
    sportProfile,
    lineOfScrimmageY: losY,
  };
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

  const { data: row, error: fetchErr } = await supabase
    .from("formations")
    .select("params")
    .eq("id", formationId)
    .single();
  if (fetchErr || !row) return { ok: false, error: fetchErr?.message ?? "Not found." };

  const updated = { ...(row.params as Record<string, unknown>), displayName: trimmed };
  const { error } = await supabase
    .from("formations")
    .update({ params: updated as unknown as Record<string, unknown> })
    .eq("id", formationId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Duplicate a formation within its own playbook. Appends " (copy)" to the
 * name. For cross-playbook copying, use copyFormationAction.
 */
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

  const { data: src, error: fetchErr } = await supabase
    .from("formations")
    .select("params, kind, playbook_id")
    .eq("id", formationId)
    .single();
  if (fetchErr || !src) return { ok: false, error: fetchErr?.message ?? "Not found." };
  if (!src.playbook_id) {
    return { ok: false, error: "Can't duplicate a seed formation." };
  }

  const srcParams = src.params as FormationParams;
  const nextParams: FormationParams = {
    ...srcParams,
    displayName: `${srcParams.displayName} (copy)`,
  };

  const { data, error } = await supabase
    .from("formations")
    .insert({
      playbook_id: src.playbook_id,
      is_seed: false,
      semantic_key: `custom_${Date.now()}`,
      params: nextParams as unknown as Record<string, unknown>,
      kind: (src.kind as string | null) ?? "offense",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, formationId: data.id as string };
}

/**
 * Deep-clone a formation into the destination playbook. If a formation with
 * the same display name already exists in that playbook, appends " 2"
 * (then " 3", etc.) to avoid collision. Used by the "Copy to playbook"
 * dialog and by copyPlayAction when formationMode="copy".
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

  // Destination gate
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

  const srcParams = src.params as FormationParams;

  // Name collision check within destination playbook only.
  const { data: existing } = await supabase
    .from("formations")
    .select("params")
    .eq("playbook_id", destinationPlaybookId);
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

  const nextParams: FormationParams = { ...srcParams, displayName: newName };

  const { data: inserted, error: insErr } = await supabase
    .from("formations")
    .insert({
      playbook_id: destinationPlaybookId,
      is_seed: false,
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
 * Formations owned by a given playbook, filtered to the playbook's variant.
 * Legacy formations missing a variant default to "flag_7v7" to match the
 * picker's existing fallback.
 */
export async function listFormationsForPlaybookAction(
  playbookId: string,
): Promise<{ ok: true; formations: SavedFormation[] } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();

  const { data: pb, error: pbErr } = await supabase
    .from("playbooks")
    .select("sport_variant")
    .eq("id", playbookId)
    .single();
  if (pbErr || !pb) return { ok: false, error: pbErr?.message ?? "Playbook not found." };

  const variant = ((pb.sport_variant as string | null) ?? "flag_7v7") as string;

  const { data: rows, error: fErr } = await supabase
    .from("formations")
    .select("id, playbook_id, is_seed, params, kind")
    .eq("playbook_id", playbookId);
  if (fErr) return { ok: false, error: fErr.message };

  const formations = (rows ?? [])
    .map((row) => rowToFormation(row))
    .filter((f) => {
      const v = (f.sportProfile?.variant as string | undefined) ?? "flag_7v7";
      return v === variant;
    });

  return { ok: true, formations };
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
    .is("formation_tag", null);

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

  const updateRes = await updateFormationAction(formationId, name, players, sportProfile);
  if (!updateRes.ok) return updateRes;

  if (!propagate) return { ok: true, updatedPlays: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

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

/**
 * Site-admin only: clone a playbook formation into the seed pool. Seeds
 * are cloned into every newly-created playbook. Idempotency is the
 * admin's responsibility (the admin seed-management view shows all
 * seeds so duplicates are avoided by eye).
 */
export async function addFormationToSeedsAction(
  formationId: string,
): Promise<{ ok: true; seedId: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Site admin only." };
  }

  const { data: src, error: srcErr } = await supabase
    .from("formations")
    .select("params, kind")
    .eq("id", formationId)
    .single();
  if (srcErr || !src) return { ok: false, error: srcErr?.message ?? "Not found." };

  const { data: inserted, error: insErr } = await supabase
    .from("formations")
    .insert({
      playbook_id: null,
      is_seed: true,
      semantic_key: `seed_${Date.now()}`,
      params: src.params as unknown as Record<string, unknown>,
      kind: (src.kind as string | null) ?? "offense",
    })
    .select("id")
    .single();

  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, seedId: inserted.id as string };
}

/**
 * Site-admin only: delete a seed formation. Existing playbook copies
 * (snapshotted at the time each playbook was created) are untouched; the
 * seed simply stops being cloned into new playbooks from now on.
 */
export async function removeSeedFormationAction(
  seedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("formations").delete().eq("id", seedId).eq("is_seed", true);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
