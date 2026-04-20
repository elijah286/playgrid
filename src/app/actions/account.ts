"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { validatePassword } from "@/lib/auth/password";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function changePasswordAction(input: { password: string }) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const pwError = validatePassword(input.password ?? "");
  if (pwError) return { ok: false as const, error: pwError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function uploadAvatarAction(formData: FormData) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "No file provided." };
  if (file.size === 0) return { ok: false as const, error: "File is empty." };
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false as const, error: "Image must be 2 MB or smaller." };
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return { ok: false as const, error: "Use PNG, JPG, WebP, or GIF." };
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `${user.id}/${crypto.randomUUID()}.${ext || "bin"}`;

  const admin = createServiceRoleClient();
  const { error: upErr } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(key, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000",
    });
  if (upErr) return { ok: false as const, error: upErr.message };

  const { data: pub } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(key);
  const url = pub.publicUrl;

  const { error: profErr } = await admin
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);
  if (profErr) return { ok: false as const, error: profErr.message };

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { ok: true as const, url };
}

export async function removeAvatarAction() {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const admin = createServiceRoleClient();
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { ok: true as const };
}
