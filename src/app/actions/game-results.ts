"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

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

// Unified row used by the Games tab. A row may represent:
//   - A scheduled event with no session yet (sessionId null, scheduled true)
//   - A session not linked to any event (eventId null, scheduled false)
//   - A linked pair (both ids present); UI shows scheduled time + outcome
//
// `when` is the canonical sort/display timestamp: prefer the event's
// scheduled `starts_at` when present so a row jumps from "future" to
// "past" at its scheduled time, not whenever Game Mode happened to run.
export type GameRow = {
  rowId: string;
  sessionId: string | null;
  eventId: string | null;
  when: string;
  status: "scheduled" | "active" | "ended";
  kind: "game" | "scrimmage";
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | null;
  locationName: string | null;
  // Scores: prefer the session when present (live truth), else the event's
  // recorded score.
  scoreUs: number | null;
  scoreThem: number | null;
  callCount: number;
  upCount: number;
};

export async function listGamesAction(playbookId: string) {
  const guard = await assertCoachAndGameResults(playbookId);
  if (!guard.ok) return guard;
  const { supabase } = guard;

  const [sessionsRes, eventsRes] = await Promise.all([
    supabase
      .from("game_sessions")
      .select(
        "id, started_at, ended_at, status, kind, opponent, score_us, score_them, calendar_event_id",
      )
      .eq("playbook_id", playbookId)
      .in("status", ["active", "ended"]),
    supabase
      .from("playbook_events")
      .select(
        "id, type, starts_at, opponent, home_away, location_name, score_us, score_them",
      )
      .eq("playbook_id", playbookId)
      .in("type", ["game", "scrimmage"])
      .is("deleted_at", null),
  ]);

  if (sessionsRes.error) {
    return { ok: false as const, error: sessionsRes.error.message };
  }
  if (eventsRes.error) {
    return { ok: false as const, error: eventsRes.error.message };
  }

  const sessions = sessionsRes.data ?? [];
  const events = eventsRes.data ?? [];

  // Counts of plays + thumbs-up per session, in one round trip.
  const sessionIds = sessions.map((s) => s.id as string);
  const counts = new Map<string, { total: number; up: number }>();
  if (sessionIds.length > 0) {
    const { data: calls } = await supabase
      .from("game_plays")
      .select("session_id, thumb")
      .in("session_id", sessionIds);
    for (const c of calls ?? []) {
      const sid = c.session_id as string;
      const cur = counts.get(sid) ?? { total: 0, up: 0 };
      cur.total += 1;
      if ((c.thumb as string | null) === "up") cur.up += 1;
      counts.set(sid, cur);
    }
  }

  // Build the merged list. Linked sessions consume their event; unlinked
  // sessions and unconsumed events each become standalone rows.
  const consumedEventIds = new Set<string>();
  const eventById = new Map(events.map((e) => [e.id as string, e]));
  const rows: GameRow[] = [];

  for (const s of sessions) {
    const eventId = (s.calendar_event_id as string | null) ?? null;
    const ev = eventId ? eventById.get(eventId) ?? null : null;
    if (ev) consumedEventIds.add(ev.id as string);
    const c = counts.get(s.id as string) ?? { total: 0, up: 0 };
    const sessionScoreUs = (s.score_us as number | null) ?? null;
    const sessionScoreThem = (s.score_them as number | null) ?? null;
    const eventScoreUs = ev ? (ev.score_us as number | null) ?? null : null;
    const eventScoreThem = ev ? (ev.score_them as number | null) ?? null : null;
    rows.push({
      rowId: `s:${s.id}`,
      sessionId: s.id as string,
      eventId: ev ? (ev.id as string) : null,
      when: ev ? (ev.starts_at as string) : (s.started_at as string),
      status: (s.status as "active" | "ended") ?? "ended",
      kind: (s.kind as string | null) === "scrimmage" ? "scrimmage" : "game",
      opponent:
        ((s.opponent as string | null) ?? null) ||
        (ev ? ((ev.opponent as string | null) ?? null) : null),
      homeAway: ev ? ((ev.home_away as GameRow["homeAway"]) ?? null) : null,
      locationName: ev ? ((ev.location_name as string | null) ?? null) : null,
      scoreUs: sessionScoreUs ?? eventScoreUs,
      scoreThem: sessionScoreThem ?? eventScoreThem,
      callCount: c.total,
      upCount: c.up,
    });
  }

  for (const ev of events) {
    if (consumedEventIds.has(ev.id as string)) continue;
    rows.push({
      rowId: `e:${ev.id}`,
      sessionId: null,
      eventId: ev.id as string,
      when: ev.starts_at as string,
      status: "scheduled",
      kind: (ev.type as string) === "scrimmage" ? "scrimmage" : "game",
      opponent: (ev.opponent as string | null) ?? null,
      homeAway: (ev.home_away as GameRow["homeAway"]) ?? null,
      locationName: (ev.location_name as string | null) ?? null,
      scoreUs: (ev.score_us as number | null) ?? null,
      scoreThem: (ev.score_them as number | null) ?? null,
      callCount: 0,
      upCount: 0,
    });
  }

  rows.sort((a, b) => b.when.localeCompare(a.when));
  return { ok: true as const, games: rows };
}

export async function listSchedulableEventsAction(
  playbookId: string,
  kind: "game" | "scrimmage",
) {
  const guard = await assertCoachAndGameResults(playbookId);
  if (!guard.ok) return guard;
  const { supabase } = guard;

  // Only events not already linked to another session are pickable.
  const { data: events } = await supabase
    .from("playbook_events")
    .select("id, starts_at, opponent, home_away, location_name, type")
    .eq("playbook_id", playbookId)
    .eq("type", kind)
    .is("deleted_at", null)
    .order("starts_at", { ascending: false })
    .limit(200);

  const ids = (events ?? []).map((e) => e.id as string);
  const linked = new Set<string>();
  if (ids.length > 0) {
    const { data: linkedRows } = await supabase
      .from("game_sessions")
      .select("calendar_event_id")
      .in("calendar_event_id", ids);
    for (const r of linkedRows ?? []) {
      const id = r.calendar_event_id as string | null;
      if (id) linked.add(id);
    }
  }

  const rows = (events ?? [])
    .filter((e) => !linked.has(e.id as string))
    .map((e) => ({
      id: e.id as string,
      startsAt: e.starts_at as string,
      opponent: (e.opponent as string | null) ?? null,
      homeAway: (e.home_away as "home" | "away" | "neutral" | null) ?? null,
      locationName: (e.location_name as string | null) ?? null,
    }));

  return { ok: true as const, events: rows };
}

export async function setSessionCalendarEventAction(
  playbookId: string,
  sessionId: string,
  eventId: string | null,
) {
  const guard = await assertCoachAndGameResults(playbookId);
  if (!guard.ok) return guard;
  const { supabase } = guard;

  if (eventId) {
    // Reject if the event already belongs to another session.
    const { data: claimed } = await supabase
      .from("game_sessions")
      .select("id")
      .eq("calendar_event_id", eventId)
      .neq("id", sessionId)
      .limit(1)
      .maybeSingle();
    if (claimed) {
      return {
        ok: false as const,
        error: "That scheduled game is already linked to another session.",
      };
    }
  }

  const { error } = await supabase
    .from("game_sessions")
    .update({ calendar_event_id: eventId })
    .eq("id", sessionId)
    .eq("playbook_id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
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
