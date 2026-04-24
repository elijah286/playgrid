"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

export type GameResultRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  kind: "game" | "scrimmage";
  opponent: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
  callCount: number;
  upCount: number;
};

async function assertCoachAndGameResults(playbookId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const [{ data: membership }, { data: profile }, betaFeatures] =
    await Promise.all([
      supabase
        .from("playbook_members")
        .select("role")
        .eq("playbook_id", playbookId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      getBetaFeatures(),
    ]);

  const role = (membership?.role as string | null) ?? null;
  const isCoachInPlaybook = role === "owner" || role === "editor";
  const isAdmin = (profile?.role as string | null) === "admin";
  const allowed = isBetaFeatureAvailable(betaFeatures.game_results, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) return { ok: false as const, error: "Forbidden." };

  return { ok: true as const, supabase, user };
}

export async function listGameResultsAction(playbookId: string) {
  const guard = await assertCoachAndGameResults(playbookId);
  if (!guard.ok) return guard;
  const { supabase } = guard;

  // Only ended sessions show up in Game Results. Active sessions belong
  // in Game Mode; surfacing them here would imply the game is over.
  const { data: sessions, error } = await supabase
    .from("game_sessions")
    .select("id, started_at, ended_at, kind, opponent, score_us, score_them")
    .eq("playbook_id", playbookId)
    .eq("status", "ended")
    .order("started_at", { ascending: false });
  if (error) return { ok: false as const, error: error.message };
  if (!sessions || sessions.length === 0) {
    return { ok: true as const, games: [] as GameResultRow[] };
  }

  const ids = sessions.map((s) => s.id as string);
  const { data: calls } = await supabase
    .from("game_plays")
    .select("session_id, thumb")
    .in("session_id", ids);

  const counts = new Map<string, { total: number; up: number }>();
  for (const c of calls ?? []) {
    const sid = c.session_id as string;
    const cur = counts.get(sid) ?? { total: 0, up: 0 };
    cur.total += 1;
    if ((c.thumb as string | null) === "up") cur.up += 1;
    counts.set(sid, cur);
  }

  const games: GameResultRow[] = sessions.map((s) => {
    const c = counts.get(s.id as string) ?? { total: 0, up: 0 };
    const kindRaw = s.kind as string | null;
    return {
      id: s.id as string,
      startedAt: s.started_at as string,
      endedAt: (s.ended_at as string | null) ?? null,
      kind: kindRaw === "scrimmage" ? "scrimmage" : "game",
      opponent: (s.opponent as string | null) ?? null,
      scoreUs: (s.score_us as number | null) ?? null,
      scoreThem: (s.score_them as number | null) ?? null,
      callCount: c.total,
      upCount: c.up,
    };
  });

  return { ok: true as const, games };
}

export async function deleteGameSessionAction(
  playbookId: string,
  sessionId: string,
) {
  const guard = await assertCoachAndGameResults(playbookId);
  if (!guard.ok) return guard;
  const { supabase } = guard;

  const { error } = await supabase
    .from("game_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("playbook_id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function updateGameSessionFinalsAction(
  playbookId: string,
  sessionId: string,
  input: {
    opponent: string | null;
    scoreUs: number | null;
    scoreThem: number | null;
  },
) {
  const guard = await assertCoachAndGameResults(playbookId);
  if (!guard.ok) return guard;
  const { supabase } = guard;

  const opponent = input.opponent?.trim() || null;
  const scoreUs =
    input.scoreUs == null || !Number.isFinite(input.scoreUs)
      ? null
      : Math.max(0, Math.trunc(input.scoreUs));
  const scoreThem =
    input.scoreThem == null || !Number.isFinite(input.scoreThem)
      ? null
      : Math.max(0, Math.trunc(input.scoreThem));

  const { error } = await supabase
    .from("game_sessions")
    .update({ opponent, score_us: scoreUs, score_them: scoreThem })
    .eq("id", sessionId)
    .eq("playbook_id", playbookId)
    .eq("status", "ended");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Rows for the Results card in the play editor. Per-play aggregates
 *  across every ended session where this play was called. */
export type PlayGameResultRow = {
  sessionId: string;
  startedAt: string;
  kind: "game" | "scrimmage";
  opponent: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
  callCount: number;
  upCount: number;
};

export async function listGameResultsForPlayAction(
  playbookId: string,
  playId: string,
) {
  const guard = await assertCoachAndGameResults(playbookId);
  if (!guard.ok) return guard;
  const { supabase } = guard;

  const { data: calls, error } = await supabase
    .from("game_plays")
    .select("session_id, thumb")
    .eq("play_id", playId);
  if (error) return { ok: false as const, error: error.message };
  if (!calls || calls.length === 0) {
    return { ok: true as const, games: [] as PlayGameResultRow[] };
  }

  const counts = new Map<string, { total: number; up: number }>();
  for (const c of calls) {
    const sid = c.session_id as string;
    const cur = counts.get(sid) ?? { total: 0, up: 0 };
    cur.total += 1;
    if ((c.thumb as string | null) === "up") cur.up += 1;
    counts.set(sid, cur);
  }

  const sessionIds = Array.from(counts.keys());
  const { data: sessions } = await supabase
    .from("game_sessions")
    .select("id, started_at, kind, opponent, score_us, score_them, status, playbook_id")
    .in("id", sessionIds)
    .eq("playbook_id", playbookId)
    .eq("status", "ended");

  const rows: PlayGameResultRow[] = (sessions ?? [])
    .map((s) => {
      const c = counts.get(s.id as string) ?? { total: 0, up: 0 };
      return {
        sessionId: s.id as string,
        startedAt: s.started_at as string,
        kind: (s.kind as string | null) === "scrimmage"
          ? ("scrimmage" as const)
          : ("game" as const),
        opponent: (s.opponent as string | null) ?? null,
        scoreUs: (s.score_us as number | null) ?? null,
        scoreThem: (s.score_them as number | null) ?? null,
        callCount: c.total,
        upCount: c.up,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return { ok: true as const, games: rows };
}
