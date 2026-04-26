"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendPlayUpdateNotification } from "@/lib/notifications/play-update-email";

const COALESCE_WINDOW_MS = 30 * 60 * 1000;
const MAX_COMMENT_LEN = 2000;

/**
 * Coach broadcasts an update to a play. Inserts a row in
 * play_team_notifications, then best-effort fans out an email to active
 * members. Within a 30-minute window per play+sender we update the existing
 * row instead of inserting a new one — repeated clicks edit the comment but
 * don't double-email.
 */
export async function notifyTeamAboutPlayAction(args: {
  playId: string;
  comment: string | null;
}): Promise<
  { ok: true; coalesced: boolean; emailedCount: number }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const trimmed = args.comment?.trim() || null;
  if (trimmed && trimmed.length > MAX_COMMENT_LEN) {
    return { ok: false, error: `Comment is too long (max ${MAX_COMMENT_LEN}).` };
  }

  const { data: play, error: playErr } = await supabase
    .from("plays")
    .select(
      "id, playbook_id, current_version_id, document, playbook:playbook_id(name)",
    )
    .eq("id", args.playId)
    .maybeSingle();
  if (playErr) return { ok: false, error: playErr.message };
  if (!play) return { ok: false, error: "Play not found." };

  const playbookRel = Array.isArray(play.playbook) ? play.playbook[0] : play.playbook;
  const playbookName = (playbookRel?.name as string | undefined) ?? "your playbook";
  const docMeta = (play.document as { metadata?: { coachName?: string } } | null)
    ?.metadata;
  const playName = docMeta?.coachName?.trim() || "Untitled play";

  const sinceIso = new Date(Date.now() - COALESCE_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from("play_team_notifications")
    .select("id")
    .eq("play_id", args.playId)
    .eq("sent_by", user.id)
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: false })
    .limit(1);

  let coalesced = false;
  if (recent && recent.length > 0) {
    coalesced = true;
    const { error } = await supabase
      .from("play_team_notifications")
      .update({
        comment: trimmed,
        play_version_id: play.current_version_id ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", recent[0].id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("play_team_notifications").insert({
      play_id: args.playId,
      play_version_id: play.current_version_id ?? null,
      sent_by: user.id,
      comment: trimmed,
    });
    if (error) return { ok: false, error: error.message };
  }

  let emailedCount = 0;
  if (!coalesced) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const senderName = (prof?.display_name as string | null) ?? null;

    try {
      await sendPlayUpdateNotification({
        playbookId: play.playbook_id as string,
        playId: args.playId,
        playName,
        playbookName,
        senderUserId: user.id,
        senderName,
        comment: trimmed,
      });
      emailedCount = 1;
    } catch {
      // best-effort
    }
  }

  revalidatePath(`/playbooks/${play.playbook_id}`);
  revalidatePath("/home");
  return { ok: true, coalesced, emailedCount };
}
