"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { PlayDocument } from "@/domain/play/types";

function randomToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createShareLinkForPlayAction(playId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: play, error } = await supabase
    .from("plays")
    .select("current_version_id")
    .eq("id", playId)
    .single();
  if (error || !play?.current_version_id) {
    return { ok: false as const, error: "Play not found or unsaved." };
  }

  const token = randomToken();
  const { error: insErr } = await supabase.from("share_links").insert({
    token,
    resource_type: "play_version",
    resource_id: play.current_version_id,
    created_by: user.id,
  });
  if (insErr) return { ok: false as const, error: insErr.message };

  try {
    const admin = createServiceRoleClient();
    await admin.from("share_events").insert({
      actor_user_id: user.id,
      share_kind: "play_link",
      resource_id: playId,
      channel: "copy_link",
      share_token: token,
    });
  } catch {
    /* best-effort telemetry */
  }

  return { ok: true as const, token };
}

export async function getSharedPlayByTokenAction(token: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const { data: link, error } = await supabase
    .from("share_links")
    .select("resource_id, expires_at, resource_type")
    .eq("token", token)
    .maybeSingle();

  if (error || !link) return { ok: false as const, error: "Link not found." };
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { ok: false as const, error: "Link expired." };
  }
  if (link.resource_type !== "play_version") {
    return { ok: false as const, error: "Unsupported resource." };
  }

  const { data: ver, error: vErr } = await supabase
    .from("play_versions")
    .select("document, id")
    .eq("id", link.resource_id)
    .single();

  if (vErr || !ver) return { ok: false as const, error: "Play not found." };

  return {
    ok: true as const,
    document: ver.document as PlayDocument,
    versionId: ver.id,
  };
}
