"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type PlaybookRow = {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  team_id: string;
  is_default: boolean;
  is_archived: boolean;
  play_count?: number;
};

/** List playbooks. Excludes the per-team "Inbox" (is_default) by default. */
export async function listPlaybooksAction(opts?: {
  includeDefault?: boolean;
  includeArchived?: boolean;
}) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", playbooks: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", playbooks: [] };

  await ensureDefaultWorkspace(supabase, user.id);

  let query = supabase
    .from("playbooks")
    .select("id, name, created_at, updated_at, team_id, is_default, is_archived")
    .order("updated_at", { ascending: false });

  if (!opts?.includeDefault) query = query.eq("is_default", false);
  if (!opts?.includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error) return { ok: false as const, error: error.message, playbooks: [] };
  return { ok: true as const, playbooks: (data ?? []) as PlaybookRow[] };
}

export async function createPlaybookAction(name: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { teamId } = await ensureDefaultWorkspace(supabase, user.id);
  const { data, error } = await supabase
    .from("playbooks")
    .insert({ team_id: teamId, name: name || "New playbook" })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data.id };
}

export async function renamePlaybookAction(playbookId: string, name: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase
    .from("playbooks")
    .update({ name: trimmed })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function archivePlaybookAction(playbookId: string, archived: boolean) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  // Guardrail: don't archive the Inbox — it has to exist for quick-create.
  const { data: book, error: selErr } = await supabase
    .from("playbooks")
    .select("is_default")
    .eq("id", playbookId)
    .single();
  if (selErr || !book) return { ok: false as const, error: selErr?.message ?? "Not found" };
  if (book.is_default) {
    return { ok: false as const, error: "Can't archive the default Inbox playbook." };
  }

  const { error } = await supabase
    .from("playbooks")
    .update({ is_archived: archived })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deletePlaybookAction(playbookId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: book, error: selErr } = await supabase
    .from("playbooks")
    .select("is_default")
    .eq("id", playbookId)
    .single();
  if (selErr || !book) return { ok: false as const, error: selErr?.message ?? "Not found" };
  if (book.is_default) {
    return { ok: false as const, error: "Can't delete the default Inbox playbook." };
  }

  const { error } = await supabase.from("playbooks").delete().eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/**
 * Deep-copy a playbook: duplicates every non-archived play and its current version document.
 * New playbook is created in the same team as the source.
 */
export async function duplicatePlaybookAction(playbookId: string, newName?: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: src, error: srcErr } = await supabase
    .from("playbooks")
    .select("id, team_id, name")
    .eq("id", playbookId)
    .single();
  if (srcErr || !src) return { ok: false as const, error: srcErr?.message ?? "Not found" };

  const { data: newBook, error: pbErr } = await supabase
    .from("playbooks")
    .insert({
      team_id: src.team_id,
      name: (newName?.trim() || `${src.name} (copy)`).slice(0, 120),
    })
    .select("id")
    .single();
  if (pbErr) return { ok: false as const, error: pbErr.message };

  // Copy plays + current versions. Archived plays are skipped.
  const { data: plays, error: playsErr } = await supabase
    .from("plays")
    .select(
      "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tag, current_version_id",
    )
    .eq("playbook_id", playbookId)
    .eq("is_archived", false);
  if (playsErr) return { ok: false as const, error: playsErr.message };

  for (const p of plays ?? []) {
    const { data: newPlay, error: insErr } = await supabase
      .from("plays")
      .insert({
        playbook_id: newBook.id,
        name: p.name,
        shorthand: p.shorthand,
        wristband_code: p.wristband_code,
        mnemonic: p.mnemonic,
        display_abbrev: p.display_abbrev,
        formation_name: p.formation_name,
        concept: p.concept,
        tag: p.tag,
      })
      .select("id")
      .single();
    if (insErr || !newPlay) continue;

    if (!p.current_version_id) continue;
    const { data: srcVer } = await supabase
      .from("play_versions")
      .select("document")
      .eq("id", p.current_version_id)
      .single();
    if (!srcVer) continue;

    const { data: newVer } = await supabase
      .from("play_versions")
      .insert({
        play_id: newPlay.id,
        schema_version: 1,
        document: srcVer.document,
        label: "copied",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (newVer) {
      await supabase
        .from("plays")
        .update({ current_version_id: newVer.id })
        .eq("id", newPlay.id);
    }
  }

  return { ok: true as const, id: newBook.id };
}
