"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStoredResendConfig, previewResendConfig } from "@/lib/site/resend-config";

const SITE_ROW_ID = "default";

async function assertAdmin() {
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
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const };
}

export async function getResendStatusAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("resend_api_key, resend_from_email, updated_at")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const preview = previewResendConfig(data?.resend_api_key, data?.resend_from_email);
    return {
      ok: true as const,
      configured: preview.configured,
      statusLabel: preview.statusLabel,
      fromEmail: preview.fromEmail,
      updatedAt: data?.updated_at ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load Resend settings.";
    return { ok: false as const, error: msg };
  }
}

export async function saveResendConfigAction(input: { apiKey: string; fromEmail: string }) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const apiKey = input.apiKey.trim();
  const fromEmail = input.fromEmail.trim();

  if (!apiKey && !fromEmail) {
    return { ok: false as const, error: "Enter a key or a from-address, or use Remove to clear." };
  }

  const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if (apiKey) {
    if (!apiKey.startsWith("re_")) {
      return {
        ok: false as const,
        error: "That does not look like a Resend API key (expected to start with re_).",
      };
    }
    patch.resend_api_key = apiKey;
  }

  if (fromEmail) {
    if (!/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$|^[^<>]+<[^<>\s]+@[^<>\s]+\.[^<>\s]+>$/.test(fromEmail)) {
      return {
        ok: false as const,
        error: "From-email must be an address or \"Name <addr@example.com>\".",
      };
    }
    patch.resend_from_email = fromEmail;
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("site_settings").update(patch).eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return { ok: false as const, error: msg };
  }
}

export async function clearResendConfigAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        resend_api_key: null,
        resend_from_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not remove settings.";
    return { ok: false as const, error: msg };
  }
}

async function pingResend(apiKey: string) {
  const res = await fetch("https://api.resend.com/domains", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const j = JSON.parse(body) as { message?: string; name?: string };
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    return { ok: false as const, error: msg };
  }
  return { ok: true as const };
}

export async function testResendKeyAction(proposedKey?: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const trimmed = (proposedKey ?? "").trim();
  let key: string | null = trimmed.length > 0 ? trimmed : null;
  if (!key) {
    try {
      const cfg = await getStoredResendConfig();
      key = cfg.apiKey;
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Could not read saved key.",
      };
    }
  }
  if (!key) {
    return { ok: false as const, error: "No key to test — paste a key above or save one first." };
  }

  const ping = await pingResend(key);
  if (!ping.ok) return { ok: false as const, error: ping.error };
  return { ok: true as const, message: "Connection OK — Resend accepted the API key." };
}
