"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createEmptyPlayDocument } from "@/domain/play/factory";
import type { PlayDocument } from "@/domain/play/types";

export async function listPlaysAction(playbookId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", plays: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", plays: [] };

  const { data, error } = await supabase
    .from("plays")
    .select("id, name, wristband_code, shorthand, concept, updated_at, current_version_id")
    .eq("playbook_id", playbookId)
    .order("updated_at", { ascending: false });

  if (error) return { ok: false as const, error: error.message, plays: [] };
  return { ok: true as const, plays: data ?? [] };
}

export async function createPlayAction(playbookId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const doc = createEmptyPlayDocument();
  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: playbookId,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      concept: doc.metadata.concept,
      tag: doc.metadata.tag,
      display_abbrev: doc.metadata.sheetAbbrev,
    })
    .select("id")
    .single();

  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 1,
      document: doc as unknown as Record<string, unknown>,
      label: "v1",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", play.id);

  return { ok: true as const, playId: play.id, versionId: ver.id };
}

export async function getPlayForEditorAction(playId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: play, error } = await supabase
    .from("plays")
    .select(
      "id, playbook_id, name, wristband_code, shorthand, concept, tag, formation_name, current_version_id",
    )
    .eq("id", playId)
    .single();

  if (error || !play) return { ok: false as const, error: error?.message ?? "Not found" };

  if (!play.current_version_id) {
    return { ok: false as const, error: "Play has no saved version." };
  }

  const { data: ver, error: vErr } = await supabase
    .from("play_versions")
    .select("id, document, label, created_at, parent_version_id")
    .eq("id", play.current_version_id)
    .single();

  if (vErr || !ver) return { ok: false as const, error: vErr?.message ?? "Version missing" };

  return {
    ok: true as const,
    play,
    version: ver,
    document: ver.document as PlayDocument,
  };
}

export async function savePlayVersionAction(
  playId: string,
  document: PlayDocument,
  label?: string,
) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: play, error: pErr } = await supabase
    .from("plays")
    .select("id, playbook_id, current_version_id")
    .eq("id", playId)
    .single();
  if (pErr || !play) return { ok: false as const, error: pErr?.message ?? "Not found" };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: playId,
      schema_version: 1,
      document: document as unknown as Record<string, unknown>,
      parent_version_id: play.current_version_id,
      label: label ?? `save ${new Date().toISOString()}`,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase
    .from("plays")
    .update({
      current_version_id: ver.id,
      name: document.metadata.coachName,
      shorthand: document.metadata.shorthand,
      wristband_code: document.metadata.wristbandCode,
      formation_name: document.metadata.formation,
      concept: document.metadata.concept,
      tag: document.metadata.tag,
      display_abbrev: document.metadata.sheetAbbrev,
    })
    .eq("id", playId);

  return { ok: true as const, versionId: ver.id };
}

export async function duplicatePlayAction(playId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const loaded = await getPlayForEditorAction(playId);
  if (!loaded.ok) {
    return { ok: false as const, error: loaded.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: src, error } = await supabase
    .from("plays")
    .select("playbook_id")
    .eq("id", playId)
    .single();
  if (error || !src) return { ok: false as const, error: "Not found" };

  const doc = structuredClone(loaded.document);
  doc.metadata.coachName = `${doc.metadata.coachName} (copy)`;

  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({
      playbook_id: src.playbook_id,
      name: doc.metadata.coachName,
      shorthand: doc.metadata.shorthand,
      wristband_code: doc.metadata.wristbandCode,
      formation_name: doc.metadata.formation,
      concept: doc.metadata.concept,
      tag: doc.metadata.tag,
      display_abbrev: doc.metadata.sheetAbbrev,
    })
    .select("id")
    .single();

  if (playErr) return { ok: false as const, error: playErr.message };

  const { data: ver, error: verErr } = await supabase
    .from("play_versions")
    .insert({
      play_id: play.id,
      schema_version: 1,
      document: doc as unknown as Record<string, unknown>,
      label: "duplicated",
      parent_version_id: loaded.version.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (verErr) return { ok: false as const, error: verErr.message };

  await supabase.from("plays").update({ current_version_id: ver.id }).eq("id", play.id);

  return { ok: true as const, playId: play.id };
}

/** Ensure workspace for actions that need team context */
export async function ensureUserWorkspaceAction() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const ws = await ensureDefaultWorkspace(supabase, user.id);
  return { ok: true as const, ...ws };
}
