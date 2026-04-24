"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

type CallInput = {
  playId: string;
  calledAt: string;
  thumb: "up" | "down" | null;
  tag: string | null;
};

type SaveInput = {
  playbookId: string;
  startedAt: string;
  endedAt: string;
  opponent: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
  notes: string | null;
  calls: CallInput[];
};

const VALID_UP_TAGS = new Set(["yards", "first_down", "score"]);
const VALID_DOWN_TAGS = new Set(["loss", "flag", "incomplete", "fumble"]);

function sanitizeCall(c: CallInput): CallInput {
  let tag = c.tag;
  if (tag != null) {
    if (c.thumb === "up" && !VALID_UP_TAGS.has(tag)) tag = null;
    else if (c.thumb === "down" && !VALID_DOWN_TAGS.has(tag)) tag = null;
    else if (c.thumb == null) tag = null;
  }
  return { ...c, tag };
}

export async function saveGameSessionAction(input: SaveInput) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  // Re-check entitlement at write time so a coach who lost access (or a
  // disabled feature) can't backfill sessions through a stale tab.
  const [{ data: membership }, { data: profile }, betaFeatures] =
    await Promise.all([
      supabase
        .from("playbook_members")
        .select("role")
        .eq("playbook_id", input.playbookId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      getBetaFeatures(),
    ]);

  const role = (membership?.role as string | null) ?? null;
  const isCoachInPlaybook = role === "owner" || role === "editor";
  const isAdmin = (profile?.role as string | null) === "admin";
  const allowed = isBetaFeatureAvailable(betaFeatures.game_mode, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) return { ok: false as const, error: "Forbidden." };

  const { data: session, error: sessionErr } = await supabase
    .from("game_sessions")
    .insert({
      playbook_id: input.playbookId,
      coach_id: user.id,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      opponent: input.opponent,
      score_us: input.scoreUs,
      score_them: input.scoreThem,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (sessionErr || !session) {
    return {
      ok: false as const,
      error: sessionErr?.message ?? "Could not save session.",
    };
  }
  const sessionId = session.id as string;

  if (input.calls.length > 0) {
    // Resolve each play's current_version_id so the review screen can
    // re-render the exact play. This is best-effort: if the play has no
    // current version (shouldn't happen for a play visible in game mode),
    // we still log the call with a null version.
    const playIds = Array.from(new Set(input.calls.map((c) => c.playId)));
    const { data: playRows } = await supabase
      .from("plays")
      .select("id, current_version_id")
      .in("id", playIds);
    const versionByPlay = new Map<string, string | null>();
    for (const r of playRows ?? []) {
      versionByPlay.set(
        r.id as string,
        (r.current_version_id as string | null) ?? null,
      );
    }

    const rows = input.calls.map((c, i) => {
      const sanitized = sanitizeCall(c);
      return {
        session_id: sessionId,
        play_id: sanitized.playId,
        play_version_id: versionByPlay.get(sanitized.playId) ?? null,
        position: i,
        called_at: sanitized.calledAt,
        thumb: sanitized.thumb,
        tag: sanitized.tag,
      };
    });
    const { error: playsErr } = await supabase.from("game_plays").insert(rows);
    if (playsErr) {
      return { ok: false as const, error: playsErr.message };
    }
  }

  return { ok: true as const, sessionId };
}
