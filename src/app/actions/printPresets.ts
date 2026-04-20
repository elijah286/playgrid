"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { PlaybookPrintRunConfig } from "@/domain/print/playbookPrint";

export type PrintPreset = {
  id: string;
  name: string;
  config: PlaybookPrintRunConfig;
  updatedAt: string;
};

export async function listPrintPresetsAction(): Promise<
  | { ok: true; presets: PrintPreset[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data, error } = await supabase
    .from("print_presets")
    .select("id, name, config, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    presets: (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      config: r.config as PlaybookPrintRunConfig,
      updatedAt: r.updated_at as string,
    })),
  };
}

export async function savePrintPresetAction(
  name: string,
  config: PlaybookPrintRunConfig,
): Promise<{ ok: true; preset: PrintPreset } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Preset name is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data, error } = await supabase
    .from("print_presets")
    .upsert(
      {
        user_id: user.id,
        name: trimmed,
        config: config as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name" },
    )
    .select("id, name, config, updated_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save preset." };
  return {
    ok: true,
    preset: {
      id: data.id as string,
      name: data.name as string,
      config: data.config as PlaybookPrintRunConfig,
      updatedAt: data.updated_at as string,
    },
  };
}

export async function deletePrintPresetAction(id: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("print_presets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
