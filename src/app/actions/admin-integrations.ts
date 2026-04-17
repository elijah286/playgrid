"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStoredOpenAIApiKey, previewOpenAIKey } from "@/lib/site/openai-key";

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
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }
  return { ok: true as const };
}

export async function getOpenAIIntegrationStatusAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("openai_api_key, updated_at")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const { configured, label } = previewOpenAIKey(data?.openai_api_key);
    return {
      ok: true as const,
      configured,
      statusLabel: label,
      updatedAt: data?.updated_at ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load settings.";
    return { ok: false as const, error: msg };
  }
}

export async function saveOpenAIApiKeyAction(rawKey: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const key = rawKey.trim();
  if (!key) {
    return { ok: false as const, error: "Paste an API key before saving, or use Remove saved key." };
  }
  if (!key.startsWith("sk-")) {
    return {
      ok: false as const,
      error: "That does not look like an OpenAI secret key (expected to start with sk-).",
    };
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        openai_api_key: key,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/admin/integrations");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return { ok: false as const, error: msg };
  }
}

export async function clearOpenAIApiKeyAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        openai_api_key: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/admin/integrations");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not remove key.";
    return { ok: false as const, error: msg };
  }
}

async function pingOpenAI(apiKey: string): Promise<{ ok: true; sampleModelId: string } | { ok: false; error: string }> {
  const res = await fetch("https://api.openai.com/v1/models?limit=1", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* ignore */
    }
    return { ok: false, error: msg };
  }
  try {
    const j = JSON.parse(body) as { data?: { id?: string }[] };
    const id = j.data?.[0]?.id;
    if (!id) return { ok: false, error: "Unexpected response from OpenAI (no models)." };
    return { ok: true, sampleModelId: id };
  } catch {
    return { ok: false, error: "Unexpected response from OpenAI." };
  }
}

/** If `proposedKey` is non-empty, tests that value; otherwise tests the saved key. */
export async function testOpenAIApiKeyAction(proposedKey?: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const trimmed = (proposedKey ?? "").trim();
  let key: string | null = trimmed.length > 0 ? trimmed : null;
  if (!key) {
    try {
      key = await getStoredOpenAIApiKey();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read saved key.";
      return { ok: false as const, error: msg };
    }
  }
  if (!key) {
    return {
      ok: false as const,
      error: "No key to test — paste a key above or save one first.",
    };
  }

  const ping = await pingOpenAI(key);
  if (!ping.ok) return { ok: false as const, error: ping.error };
  return {
    ok: true as const,
    message: `Connection OK — OpenAI returned model “${ping.sampleModelId}”.`,
  };
}
