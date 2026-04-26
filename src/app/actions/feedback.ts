"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getFeedbackWidgetSettings,
  setFeedbackWidgetEnabled,
  setFeedbackWidgetTouchEnabled,
} from "@/lib/site/feedback-config";

export type FeedbackRow = {
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  message: string;
  source: "widget" | "contact";
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
    .select("id, user_id, message, created_at, name, email, source")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false as const, error: error.message, items: [] };

  const userIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => r.user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );
  const [{ data: profiles }, authRes] = userIds.length
    ? await Promise.all([
        admin.from("profiles").select("id, display_name").in("id", userIds),
        admin.auth.admin.listUsers({ perPage: 200, page: 1 }),
      ])
    : ([{ data: [] }, { data: { users: [] } }] as const);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  const emailMap = new Map((authRes.data.users ?? []).map((u) => [u.id, u.email ?? null]));

  const items: FeedbackRow[] = (rows ?? []).map((r) => {
    const uid = (r.user_id as string | null) ?? null;
    const source = (r.source as string) === "contact" ? "contact" : "widget";
    return {
      id: r.id as string,
      userId: uid,
      email: uid ? emailMap.get(uid) ?? null : (r.email as string | null) ?? null,
      displayName: uid
        ? profileMap.get(uid) ?? null
        : (r.name as string | null) ?? null,
      message: r.message as string,
      source,
      createdAt: r.created_at as string,
    };
  });

  return { ok: true as const, items };
}

export async function deleteFeedbackAction(id: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("feedback").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/settings");
  return { ok: true as const };
}

export async function getFeedbackWidgetEnabledAction() {
  if (!hasSupabaseEnv()) {
    return { ok: true as const, enabled: true, touchEnabled: false };
  }
  const settings = await getFeedbackWidgetSettings();
  return { ok: true as const, ...settings };
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }
  return { ok: true as const };
}

export async function setFeedbackWidgetEnabledAction(enabled: boolean) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  try {
    await setFeedbackWidgetEnabled(enabled);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }

  revalidatePath("/", "layout");
  return { ok: true as const, enabled };
}

export async function setFeedbackWidgetTouchEnabledAction(enabled: boolean) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  try {
    await setFeedbackWidgetTouchEnabled(enabled);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }

  revalidatePath("/", "layout");
  return { ok: true as const, enabled };
}
