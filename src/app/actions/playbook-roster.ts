"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type PlaybookRosterMember = {
  user_id: string;
  role: "owner" | "editor" | "viewer";
  label: string | null;
  jersey_number: string | null;
  position: string | null;
  is_minor: boolean;
  display_name: string | null;
  created_at: string;
};

export async function listPlaybookRosterAction(
  playbookId: string,
): Promise<
  | { ok: true; members: PlaybookRosterMember[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("playbook_members")
    .select(
      "user_id, role, label, jersey_number, position, is_minor, created_at, profiles:user_id(display_name)",
    )
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const members: PlaybookRosterMember[] = (data ?? []).map((row) => {
    const prof = row.profiles as
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
    const profile = Array.isArray(prof) ? prof[0] ?? null : prof;
    return {
      user_id: row.user_id,
      role: row.role,
      label: row.label,
      jersey_number: row.jersey_number,
      position: row.position,
      is_minor: row.is_minor,
      display_name: profile?.display_name ?? null,
      created_at: row.created_at,
    };
  });

  return { ok: true, members };
}
