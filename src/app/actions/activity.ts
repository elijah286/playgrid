"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type ActivityKind = "play_update" | "member_joined";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  playbookId: string;
  playbookName: string;
  playbookLogoUrl: string | null;
  playbookColor: string | null;
  actorDisplayName: string | null;
  /** ISO timestamp the event occurred. */
  occurredAt: string;
  // play_update
  playId?: string;
  playName?: string;
  comment?: string | null;
  // member_joined
  joinedRole?: "owner" | "editor" | "viewer";
};

const MEMBER_JOIN_LOOKBACK_DAYS = 30;

/**
 * Player-side feed of low-priority events the caller has access to:
 * coach broadcasts about plays + recent member joins. No new-content
 * dot/badge — players check this when they want, not because something
 * needs their action.
 */
export async function listActivityFeedAction(
  limit = 80,
): Promise<
  | { ok: true; entries: ActivityEntry[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: playbookIdRows, error: pbErr } = await supabase
    .from("playbook_members")
    .select("playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("playbooks.is_archived", false);
  if (pbErr) return { ok: false, error: pbErr.message };

  type PbRow = {
    playbook_id: string;
    playbooks:
      | { id: string; name: string; logo_url: string | null; color: string | null }
      | { id: string; name: string; logo_url: string | null; color: string | null }[]
      | null;
  };
  const playbookMeta = new Map<
    string,
    { name: string; logo_url: string | null; color: string | null }
  >();
  for (const r of (playbookIdRows ?? []) as unknown as PbRow[]) {
    const b = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    if (!b) continue;
    playbookMeta.set(b.id, {
      name: b.name,
      logo_url: b.logo_url,
      color: b.color,
    });
  }
  const playbookIds = Array.from(playbookMeta.keys());
  if (playbookIds.length === 0) return { ok: true, entries: [] };

  const memberSince = new Date(
    Date.now() - MEMBER_JOIN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [updatesRes, joinsRes] = await Promise.all([
    supabase
      .from("play_team_notifications")
      .select(
        "id, sent_at, sent_by, comment, play:play_id!inner(id, document, playbook_id)",
      )
      .in("play.playbook_id", playbookIds)
      .order("sent_at", { ascending: false })
      .limit(limit),
    supabase
      .from("playbook_members")
      .select("playbook_id, user_id, role, created_at")
      .in("playbook_id", playbookIds)
      .eq("status", "active")
      .neq("user_id", user.id)
      .gte("created_at", memberSince)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (updatesRes.error) return { ok: false, error: updatesRes.error.message };
  if (joinsRes.error) return { ok: false, error: joinsRes.error.message };

  type UpdateRow = {
    id: string;
    sent_at: string;
    sent_by: string;
    comment: string | null;
    play:
      | { id: string; document: unknown; playbook_id: string }
      | { id: string; document: unknown; playbook_id: string }[]
      | null;
  };
  type JoinRow = {
    playbook_id: string;
    user_id: string;
    role: "owner" | "editor" | "viewer";
    created_at: string;
  };

  const actorIds = new Set<string>();
  for (const r of (updatesRes.data ?? []) as unknown as UpdateRow[]) {
    if (r.sent_by) actorIds.add(r.sent_by);
  }
  for (const r of (joinsRes.data ?? []) as unknown as JoinRow[]) {
    if (r.user_id) actorIds.add(r.user_id);
  }
  const actorNames = new Map<string, string | null>();
  if (actorIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", Array.from(actorIds));
    for (const p of profs ?? []) {
      actorNames.set(
        p.id as string,
        (p.display_name as string | null) ?? null,
      );
    }
  }

  const entries: ActivityEntry[] = [];

  for (const r of (updatesRes.data ?? []) as unknown as UpdateRow[]) {
    const play = Array.isArray(r.play) ? r.play[0] : r.play;
    if (!play) continue;
    const meta = playbookMeta.get(play.playbook_id);
    if (!meta) continue;
    const docMeta = (play.document as { metadata?: { coachName?: string } } | null)
      ?.metadata;
    const playName = docMeta?.coachName?.trim() || "Untitled play";
    entries.push({
      id: `pu:${r.id}`,
      kind: "play_update",
      playbookId: play.playbook_id,
      playbookName: meta.name,
      playbookLogoUrl: meta.logo_url,
      playbookColor: meta.color,
      actorDisplayName: actorNames.get(r.sent_by) ?? null,
      occurredAt: r.sent_at,
      playId: play.id,
      playName,
      comment: r.comment,
    });
  }

  for (const r of (joinsRes.data ?? []) as unknown as JoinRow[]) {
    const meta = playbookMeta.get(r.playbook_id);
    if (!meta) continue;
    entries.push({
      id: `mj:${r.playbook_id}:${r.user_id}`,
      kind: "member_joined",
      playbookId: r.playbook_id,
      playbookName: meta.name,
      playbookLogoUrl: meta.logo_url,
      playbookColor: meta.color,
      actorDisplayName: actorNames.get(r.user_id) ?? null,
      occurredAt: r.created_at,
      joinedRole: r.role,
    });
  }

  entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return { ok: true, entries: entries.slice(0, limit) };
}
