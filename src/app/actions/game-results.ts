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
