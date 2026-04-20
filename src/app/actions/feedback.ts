"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type FeedbackRow = {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  message: string;
  createdAt: string;
};

export async function submitFeedbackAction(message: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const trimmed = message.trim();
  if (!trimmed) return { ok: false as const, error: "Please enter some feedback." };
  if (trimmed.length > 4000) {
    return { ok: false as const, error: "Feedback is too long (max 4000 characters)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in to send feedback." };

  const { error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, message: trimmed });
  if (error) return { ok: false as const, error: error.message };

  return { ok: true as const };
}

export async function listFeedbackForAdminAction() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", items: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", items: [] };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden.", items: [] };
  }

  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from("feedback")
    .select("id, user_id, message, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false as const, error: error.message, items: [] };

  const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id as string)));
  const [{ data: profiles }, authRes] = await Promise.all([
    admin.from("profiles").select("id, display_name").in("id", userIds),
    admin.auth.admin.listUsers({ perPage: 200, page: 1 }),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  const emailMap = new Map((authRes.data.users ?? []).map((u) => [u.id, u.email ?? null]));

  const items: FeedbackRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    email: emailMap.get(r.user_id as string) ?? null,
    displayName: profileMap.get(r.user_id as string) ?? null,
    message: r.message as string,
    createdAt: r.created_at as string,
  }));

  return { ok: true as const, items };
}
