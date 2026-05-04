"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { PlaybookPrintRunConfig, PrintProductKind } from "@/domain/print/playbookPrint";

export type PrintPreset = {
  id: string;
  name: string;
  config: PlaybookPrintRunConfig;
  updatedAt: string;
  /** "user" — coach-saved; "system" — admin-promoted, visible to everyone. */
  kind: "user" | "system";
  /** Only present on system presets; rendered as a tooltip in the UI. */
  description: string | null;
  /** Only present on system presets; small PNG captured at promotion time. */
  thumbnailUrl: string | null;
  /** Format the preset targets — derived from config.product. */
  product: PrintProductKind;
};

function rowToPreset(r: {
  id: string;
  name: string;
  config: unknown;
  updated_at: string;
  is_system?: boolean | null;
  description?: string | null;
  thumbnail_url?: string | null;
  product?: string | null;
}): PrintPreset {
  const cfg = r.config as PlaybookPrintRunConfig;
  const product = (r.product as PrintProductKind | null) ?? cfg.product ?? "playsheet";
  return {
    id: r.id,
    name: r.name,
    config: cfg,
    updatedAt: r.updated_at,
    kind: r.is_system ? "system" : "user",
    description: r.description ?? null,
    thumbnailUrl: r.thumbnail_url ?? null,
    product,
  };
}

/**
 * Returns every preset visible to the current user — their own user presets
 * plus the global system presets — so the print page can show both.
 */
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
  // RLS exposes both `is_system = true` rows and the user's own rows.
  const { data, error } = await supabase
    .from("print_presets")
    .select("id, name, config, updated_at, is_system, description, thumbnail_url, product")
    .order("is_system", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    presets: (data ?? []).map((r) =>
      rowToPreset(r as Parameters<typeof rowToPreset>[0]),
    ),
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
        product: config.product,
        is_system: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name" },
    )
    .select("id, name, config, updated_at, is_system, description, thumbnail_url, product")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save preset." };
  return {
    ok: true,
    preset: rowToPreset(data as Parameters<typeof rowToPreset>[0]),
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
  // RLS scopes deletes to the user's own non-system rows.
  const { error } = await supabase
    .from("print_presets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_system", false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";
  return { supabase, user, isAdmin };
}

/**
 * Promote a coach-saved preset (or arbitrary config) into a system preset
 * everyone sees. Requires the caller to be a site admin.
 *
 * The thumbnail data URL (PNG produced client-side from the live preview SVG)
 * is uploaded to the `print-preset-thumbnails` bucket; only the public URL is
 * persisted on the row.
 */
export async function promoteToSystemPresetAction(input: {
  name: string;
  description: string;
  config: PlaybookPrintRunConfig;
  thumbnailDataUrl: string | null;
}): Promise<{ ok: true; preset: PrintPreset } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const description = input.description.trim();

  const { supabase, isAdmin } = await requireAdminUser();
  if (!isAdmin) return { ok: false, error: "Site admin only." };

  // Upload the captured PNG, if any. We swallow upload errors and proceed
  // without a thumbnail rather than blocking the promotion.
  let thumbnailUrl: string | null = null;
  if (input.thumbnailDataUrl && input.thumbnailDataUrl.startsWith("data:image/png")) {
    try {
      const base64 = input.thumbnailDataUrl.split(",")[1] ?? "";
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      const { error: upErr } = await supabase.storage
        .from("print-preset-thumbnails")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (!upErr) {
        const { data: pub } = supabase.storage
          .from("print-preset-thumbnails")
          .getPublicUrl(path);
        thumbnailUrl = pub.publicUrl ?? null;
      }
    } catch {
      thumbnailUrl = null;
    }
  }

  // System rows are uniquely indexed on `name` via a *partial* unique index
  // (`where is_system`). Postgres ON CONFLICT can't target partial indexes
  // through PostgREST, so do an explicit lookup → update or insert.
  const { data: existing } = await supabase
    .from("print_presets")
    .select("id")
    .eq("is_system", true)
    .eq("name", name)
    .maybeSingle();

  const payload = {
    user_id: null,
    name,
    config: input.config as unknown as Record<string, unknown>,
    product: input.config.product,
    is_system: true,
    description: description || null,
    thumbnail_url: thumbnailUrl,
    updated_at: new Date().toISOString(),
  };

  let row: unknown;
  let writeErr: { message: string } | null = null;
  if (existing?.id) {
    // Don't overwrite the existing thumbnail with null when no new one was
    // captured this round.
    const updatePayload =
      thumbnailUrl == null
        ? Object.fromEntries(
            Object.entries(payload).filter(([k]) => k !== "thumbnail_url"),
          )
        : payload;
    const { data, error } = await supabase
      .from("print_presets")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("id, name, config, updated_at, is_system, description, thumbnail_url, product")
      .single();
    row = data;
    writeErr = error;
  } else {
    const { data, error } = await supabase
      .from("print_presets")
      .insert(payload)
      .select("id, name, config, updated_at, is_system, description, thumbnail_url, product")
      .single();
    row = data;
    writeErr = error;
  }
  if (writeErr || !row) {
    return { ok: false, error: writeErr?.message ?? "Could not promote preset." };
  }
  return { ok: true, preset: rowToPreset(row as Parameters<typeof rowToPreset>[0]) };
}

export async function deleteSystemPresetAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const { supabase, isAdmin } = await requireAdminUser();
  if (!isAdmin) return { ok: false, error: "Site admin only." };
  const { error } = await supabase
    .from("print_presets")
    .delete()
    .eq("id", id)
    .eq("is_system", true);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
