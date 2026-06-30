"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";

export type StoreItemRow = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  required: boolean;
  active: boolean;
  /** Size/variant options a family chooses from (e.g. ["Youth M", "Adult L"]). */
  sizes: string[];
  /** Product photo URL, or null. Stored in options.imageUrl (no schema change). */
  imageUrl: string | null;
};

export type StoreItemInput = {
  name: string;
  description?: string | null;
  priceCents: number;
  required?: boolean;
  active?: boolean;
  sizes?: string[];
  imageUrl?: string | null;
};

/** Clean a size list: trim, drop blanks, dedupe (case-insensitive), cap. */
function cleanSizes(sizes: string[] | undefined): string[] {
  if (!Array.isArray(sizes)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of sizes) {
    const s = String(raw).trim().slice(0, 24);
    const key = s.toLowerCase();
    if (s && !seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
    if (out.length >= 20) break;
  }
  return out;
}

function sizesFromOptions(options: unknown): string[] {
  const o = (options ?? {}) as { sizes?: unknown };
  return Array.isArray(o.sizes) ? o.sizes.map((s) => String(s)).filter(Boolean) : [];
}

function imageUrlFromOptions(options: unknown): string | null {
  const o = (options ?? {}) as { imageUrl?: unknown };
  return typeof o.imageUrl === "string" && o.imageUrl ? o.imageUrl : null;
}

// Reuse the existing public image bucket (avoids a new bucket migration); store
// images are namespaced under a league-store/ prefix.
const STORE_IMAGE_BUCKET = "playbook-logos";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Upload a product photo to the public image bucket; returns its public URL.
 *  Signed-in gate only — the URL is harmless until attached to an item (which is
 *  league-admin-gated by create/updateStoreItemAction). */
export async function uploadStoreImageAction(formData: FormData) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "No file provided." };
  if (file.size === 0) return { ok: false as const, error: "File is empty." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false as const, error: "Image must be 4 MB or smaller." };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false as const, error: "Unsupported image type. Use PNG, JPG, WebP, or GIF." };
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `league-store/${user.id}/${crypto.randomUUID()}.${ext || "bin"}`;

  const admin = createServiceRoleClient();
  const { error: upErr } = await admin.storage
    .from(STORE_IMAGE_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (upErr) return { ok: false as const, error: upErr.message };

  const { data: pub } = admin.storage.from(STORE_IMAGE_BUCKET).getPublicUrl(key);
  return { ok: true as const, url: pub.publicUrl };
}

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const, supabase };
}

function fields(input: StoreItemInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price_cents: Math.max(0, Math.trunc(input.priceCents || 0)),
    required: !!input.required,
    active: input.active === undefined ? true : !!input.active,
    options: { sizes: cleanSizes(input.sizes), imageUrl: input.imageUrl?.trim() || null },
  };
}

export async function listStoreItemsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as StoreItemRow[] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("league_store_items")
    .select("id, name, description, price_cents, required, active, options")
    .eq("league_id", leagueId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false as const, error: error.message, items: [] as StoreItemRow[] };
  const items: StoreItemRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    priceCents: (r.price_cents as number) ?? 0,
    required: !!r.required,
    active: !!r.active,
    sizes: sizesFromOptions(r.options),
    imageUrl: imageUrlFromOptions(r.options),
  }));
  return { ok: true as const, items };
}

export async function createStoreItemAction(leagueId: string, input: StoreItemInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const f = fields(input);
  if (!f.name) return { ok: false as const, error: "Item name is required." };
  const { error } = await gate.supabase.from("league_store_items").insert({ league_id: leagueId, ...f });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}

export async function updateStoreItemAction(leagueId: string, id: string, input: StoreItemInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const f = fields(input);
  if (!f.name) return { ok: false as const, error: "Item name is required." };
  const { error } = await gate.supabase
    .from("league_store_items")
    .update(f)
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}

export async function deleteStoreItemAction(leagueId: string, id: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { error } = await gate.supabase
    .from("league_store_items")
    .delete()
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}
