"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type PlaybookRosterMember = {
  user_id: string;
  role: "owner" | "editor" | "viewer";
  status: "pending" | "active";
  label: string | null;
  jersey_number: string | null;
  position: string | null;
  is_minor: boolean;
  is_head_coach: boolean;
  coach_title: string | null;
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
      "user_id, role, status, label, jersey_number, position, is_minor, is_head_coach, coach_title, created_at, profiles:user_id(display_name)",
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
      status: row.status,
      label: row.label,
      jersey_number: row.jersey_number,
      position: row.position,
      is_minor: row.is_minor,
      is_head_coach: Boolean(row.is_head_coach),
      coach_title: (row.coach_title as string | null) ?? null,
      display_name: profile?.display_name ?? null,
      created_at: row.created_at,
    };
  });

  return { ok: true, members };
}

export async function approveMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_members")
    .update({ status: "active" })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function denyMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_members")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

/**
 * Set a single head coach for the playbook. Clears the existing head-coach
 * flag first (enforced by a partial unique index). Pass `userId=null` to
 * clear without setting a new one.
 */
export async function setHeadCoachAction(
  playbookId: string,
  userId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();

  const { error: clearErr } = await supabase
    .from("playbook_members")
    .update({ is_head_coach: false })
    .eq("playbook_id", playbookId)
    .eq("is_head_coach", true);
  if (clearErr) return { ok: false, error: clearErr.message };

  if (userId) {
    const { error: setErr } = await supabase
      .from("playbook_members")
      .update({ is_head_coach: true })
      .eq("playbook_id", playbookId)
      .eq("user_id", userId);
    if (setErr) return { ok: false, error: setErr.message };
  }
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function setCoachTitleAction(
  playbookId: string,
  userId: string,
  title: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const cleaned = (title ?? "").trim();
  const { error } = await supabase
    .from("playbook_members")
    .update({ coach_title: cleaned.length > 0 ? cleaned : null })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function removeStaffMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_members")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}
