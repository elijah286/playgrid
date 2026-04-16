"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export async function listPlaybooksAction() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", playbooks: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", playbooks: [] };

  await ensureDefaultWorkspace(supabase, user.id);

  const { data, error } = await supabase
    .from("playbooks")
    .select("id, name, created_at, team_id")
    .order("updated_at", { ascending: false });

  if (error) return { ok: false as const, error: error.message, playbooks: [] };
  return { ok: true as const, playbooks: data ?? [] };
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
