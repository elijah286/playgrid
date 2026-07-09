"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";
import { gateLeagueCapability, resolveLeagueView } from "@/lib/league/authorize";

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
  const auth = await getRequestUser();
  if (auth.kind !== "ok" || !auth.user) return { ok: false as const, error: "Not signed in." };
  const user = auth.user;

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

// Store writes require the manage_store capability (owners always have it).
function gateAdmin(leagueId: string) {
  return gateLeagueCapability(leagueId, "manage_store");
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
  // Grant-aware read: a member reads via RLS; a delegated member with manage_store
  // reads via the service role.
  const access = await resolveLeagueView(leagueId, { delegateCapability: "manage_store" });
  if (!access) return { ok: true as const, items: [] as StoreItemRow[] };
  const supabase = access.db;
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

// Store items surface on the admin Store page AND inside the public
// registration form (as add-ons), so writes revalidate both.
function revalidateStore(leagueId: string) {
  revalidatePath(`/league/${leagueId}/store`);
  revalidatePath(`/league/${leagueId}/registration`);
}

export async function createStoreItemAction(leagueId: string, input: StoreItemInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const f = fields(input);
  if (!f.name) return { ok: false as const, error: "Item name is required." };
  const { error } = await gate.supabase.from("league_store_items").insert({ league_id: leagueId, ...f });
  if (error) return { ok: false as const, error: error.message };
  revalidateStore(leagueId);
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
  revalidateStore(leagueId);
  return { ok: true as const };
}

/** Show/hide an item in the family-facing store without touching its fields. */
export async function setStoreItemActiveAction(leagueId: string, id: string, active: boolean) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { error } = await gate.supabase
    .from("league_store_items")
    .update({ active })
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidateStore(leagueId);
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
  revalidateStore(leagueId);
  return { ok: true as const };
}

/** Typical youth-league items, added inactive-free and fully editable — a
 *  one-click way to see the store populated and learn the shape of an item. */
const SAMPLE_ITEMS: StoreItemInput[] = [
  {
    name: "Team Jersey",
    description: "Game jersey in team colors with printed number.",
    priceCents: 2500,
    sizes: ["Youth S", "Youth M", "Youth L", "Adult S", "Adult M", "Adult L"],
  },
  {
    name: "Practice Tee",
    description: "Lightweight moisture-wicking tee for practices.",
    priceCents: 1400,
    sizes: ["Youth S", "Youth M", "Youth L", "Adult M", "Adult L"],
  },
  {
    name: "Mouthguard",
    description: "Boil-and-bite protective mouthguard.",
    priceCents: 600,
  },
  {
    name: "Team Photo Package",
    description: "Individual and team photo prints, delivered mid-season.",
    priceCents: 1800,
  },
];

export async function addSampleStoreItemsAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;

  const { data: existing } = await gate.supabase
    .from("league_store_items")
    .select("name")
    .eq("league_id", leagueId);
  const taken = new Set((existing ?? []).map((r) => (r.name as string).toLowerCase()));

  const rows = SAMPLE_ITEMS.filter((s) => !taken.has(s.name.toLowerCase())).map((s, i) => ({
    league_id: leagueId,
    ...fields(s),
    sort_order: i,
  }));
  if (rows.length === 0) return { ok: true as const, added: 0 };

  const { error } = await gate.supabase.from("league_store_items").insert(rows);
  if (error) return { ok: false as const, error: error.message };
  revalidateStore(leagueId);
  return { ok: true as const, added: rows.length };
}
