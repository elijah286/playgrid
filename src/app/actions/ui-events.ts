"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { readConsentCookie, shouldSuppressTracking } from "@/lib/attribution/consent";
import { lookupGeo } from "@/lib/geo/maxmind";
import { clientIpFromHeaders } from "@/lib/geo/request-ip";
import { headers } from "next/headers";

export type RecordUiEventInput = {
  sessionId: string;
  eventName: string;
  path?: string | null;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
};

function trim(v: string | null | undefined, max = 256): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function recordUiEventAction(input: RecordUiEventInput) {
  try {
    if (!hasSupabaseEnv()) return { ok: true as const };
    if (!input?.sessionId || !input?.eventName) return { ok: true as const };

    const h = await headers();
    let isEu = false;
    if (!h.get("x-vercel-ip-country")) {
      const geo = await lookupGeo(clientIpFromHeaders(h));
      isEu = geo.isEu;
    }
    const consent = await readConsentCookie();
    if (shouldSuppressTracking({ isEu, consent })) return { ok: true as const };

    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const admin = createServiceRoleClient();
    await admin.from("ui_events").insert({
      session_id: input.sessionId.slice(0, 128),
      user_id: userId,
      path: trim(input.path ?? null, 2048),
      event_name: input.eventName.slice(0, 64),
      target: trim(input.target ?? null, 256),
      metadata: input.metadata ?? null,
    });
    return { ok: true as const };
  } catch {
    return { ok: true as const };
  }
}

export type RecordPageDwellInput = {
  sessionId: string;
  path: string;
  dwellMs: number;
  isExit: boolean;
};

/** Patches the most recent page_views row for this (session, path) with the
 *  measured dwell time and whether it was the last page of the session.
 *  Best-effort — beacon may fail and that's fine. */
export async function recordPageDwellAction(input: RecordPageDwellInput) {
  try {
    if (!hasSupabaseEnv()) return { ok: true as const };
    if (!input?.sessionId || !input?.path) return { ok: true as const };
    if (!Number.isFinite(input.dwellMs) || input.dwellMs <= 0) return { ok: true as const };

    const dwell = Math.min(Math.floor(input.dwellMs), 60 * 60 * 1000);
    const admin = createServiceRoleClient();
    const { data: rows } = await admin
      .from("page_views")
      .select("id")
      .eq("session_id", input.sessionId)
      .eq("path", input.path)
      .order("created_at", { ascending: false })
      .limit(1);
    const id = rows?.[0]?.id;
    if (!id) return { ok: true as const };
    await admin
      .from("page_views")
      .update({ dwell_ms: dwell, is_exit: !!input.isExit })
      .eq("id", id);
    return { ok: true as const };
  } catch {
    return { ok: true as const };
  }
}

export type RecordShareEventInput = {
  shareKind: "play_link" | "playbook_copy" | "playbook_invite" | "native" | "promo";
  resourceId?: string | null;
  channel?: string | null;
  shareToken?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Provided when called from a client component without a user session in
   *  scope (e.g. a logged-out share). Server-side actions should leave this
   *  empty so the actor is read from auth. */
  actorUserIdOverride?: string | null;
};

export async function recordShareEventAction(input: RecordShareEventInput) {
  try {
    if (!hasSupabaseEnv()) return { ok: true as const };
    if (!input?.shareKind) return { ok: true as const };

    let actor = input.actorUserIdOverride ?? null;
    if (!actor) {
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        actor = user?.id ?? null;
      } catch {
        actor = null;
      }
    }

    const admin = createServiceRoleClient();
    await admin.from("share_events").insert({
      actor_user_id: actor,
      share_kind: input.shareKind,
      resource_id: trim(input.resourceId ?? null, 128),
      channel: trim(input.channel ?? null, 32),
      share_token: trim(input.shareToken ?? null, 256),
      metadata: input.metadata ?? null,
    });
    return { ok: true as const };
  } catch {
    return { ok: true as const };
  }
}
