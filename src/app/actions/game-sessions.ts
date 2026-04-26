"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

// Historical legacy save (kept for the offline-only save-at-end path, if any
// lingering caller uses it). New flow is: start -> record per call -> end.

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

function sanitizeTag(thumb: "up" | "down" | null, tag: string | null): string | null {
  if (tag == null) return null;
  if (thumb === "up") return VALID_UP_TAGS.has(tag) ? tag : null;
  if (thumb === "down") return VALID_DOWN_TAGS.has(tag) ? tag : null;
  return null;
}

/**
 * Builds the frozen snapshot blob written to game_plays.snapshot at call
 * time. Captured here (not at review time) because play_versions rows are
 * not strictly immutable — renamePlayAction can mutate the current
 * version's document.metadata.coachName, and migrations have backfilled
 * historical version documents. The snapshot is the authoritative render
 * source for Game Results.
 *
 * Returns a literal object always; never throws. If lookups fail we still
 * write a valid (mostly-empty) snapshot so the call row is never lost.
 */
async function buildPlaySnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playId: string,
): Promise<Record<string, unknown>> {
  const { data: play } = await supabase
    .from("plays")
    .select("name, group_id, current_version_id")
    .eq("id", playId)
    .maybeSingle();
  const versionId = (play?.current_version_id as string | null) ?? null;
  const groupId = (play?.group_id as string | null) ?? null;
  const [verRes, groupRes] = await Promise.all([
    versionId
      ? supabase
          .from("play_versions")
          .select("document")
          .eq("id", versionId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    groupId
      ? supabase
          .from("playbook_groups")
          .select("name")
          .eq("id", groupId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    snapshotVersion: 1,
    play: (verRes.data as { document?: unknown } | null)?.document ?? null,
    playName: (play?.name as string | null) ?? "",
    groupName: (groupRes.data as { name?: string | null } | null)?.name ?? null,
  };
}

/**
 * Find the playbook_event most likely to correspond to a game session
 * starting "now". Same calendar day in the event's timezone, matching
 * kind, not soft-deleted, and not already linked to a different active
 * or ended session. Closest scheduled time to now wins.
 *
 * Returns null when nothing matches — Game Mode still launches; the
 * coach can manually merge later from the Games tab.
 */
async function findScheduledEventForNow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playbookId: string,
  kind: "game" | "scrimmage",
  nowIso: string,
): Promise<string | null> {
  const now = new Date(nowIso);
  // 24h window covers any timezone offset; we'll narrow to "same local
  // day" client-side per event using its stored IANA timezone.
  const lo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const hi = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from("playbook_events")
    .select("id, starts_at, timezone")
    .eq("playbook_id", playbookId)
    .eq("type", kind)
    .is("deleted_at", null)
    .gte("starts_at", lo)
    .lte("starts_at", hi);
  if (!events || events.length === 0) return null;

  function localDateKey(iso: string, tz: string): string {
    try {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return fmt.format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  }

  let best: { id: string; deltaMs: number } | null = null;
  for (const e of events) {
    const tz = (e.timezone as string | null) || "America/New_York";
    const startIso = e.starts_at as string;
    if (localDateKey(nowIso, tz) !== localDateKey(startIso, tz)) continue;
    const deltaMs = Math.abs(new Date(startIso).getTime() - now.getTime());
    if (!best || deltaMs < best.deltaMs) best = { id: e.id as string, deltaMs };
  }
  if (!best) return null;

  // Prefer not stealing an event that's already linked to another session.
  const { data: claimed } = await supabase
    .from("game_sessions")
    .select("id")
    .eq("calendar_event_id", best.id)
    .limit(1)
    .maybeSingle();
  if (claimed) return null;

  return best.id;
}

async function assertCoachOfPlaybook(playbookId: string) {
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
  const allowed = isBetaFeatureAvailable(betaFeatures.game_mode, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) return { ok: false as const, error: "Forbidden." };

  return { ok: true as const, supabase, user };
}

// ---------------------------------------------------------------------------
// Live session lifecycle
// ---------------------------------------------------------------------------

/** Start a new active session for the given playbook (or join the existing
 *  active one). First coach to start becomes the caller. Idempotent: if an
 *  active session already exists, returns it and inserts/refreshes a
 *  participant row for the current user. */
export async function startOrJoinGameSessionAction(
  playbookId: string,
  opts?: { kind?: "game" | "scrimmage"; opponent?: string | null },
) {
  const guard = await assertCoachOfPlaybook(playbookId);
  if (!guard.ok) return guard;
  const { supabase, user } = guard;

  const nowIso = new Date().toISOString();
  const kind = opts?.kind === "scrimmage" ? "scrimmage" : "game";
  const opponent = opts?.opponent?.trim() || null;

  const { data: existing } = await supabase
    .from("game_sessions")
    .select("id, caller_user_id, started_at")
    .eq("playbook_id", playbookId)
    .eq("status", "active")
    .maybeSingle();

  let sessionId: string;
  if (existing) {
    sessionId = existing.id as string;
  } else {
    // Best-effort: link the new session to a same-day scheduled event of
    // the matching kind so the Games tab can collapse them into one row.
    // The coach can override or break the link later from the tab.
    const calendarEventId = await findScheduledEventForNow(
      supabase,
      playbookId,
      kind,
      nowIso,
    );
    let inheritedOpponent = opponent;
    if (calendarEventId && !inheritedOpponent) {
      const { data: ev } = await supabase
        .from("playbook_events")
        .select("opponent")
        .eq("id", calendarEventId)
        .maybeSingle();
      inheritedOpponent = (ev?.opponent as string | null) || null;
    }
    const { data: inserted, error } = await supabase
      .from("game_sessions")
      .insert({
        playbook_id: playbookId,
        coach_id: user.id,
        caller_user_id: user.id,
        caller_changed_at: nowIso,
        started_at: nowIso,
        status: "active",
        kind,
        opponent: inheritedOpponent,
        calendar_event_id: calendarEventId,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      // Race: someone else just started one. Re-read.
      const { data: retry } = await supabase
        .from("game_sessions")
        .select("id")
        .eq("playbook_id", playbookId)
        .eq("status", "active")
        .maybeSingle();
      if (!retry) {
        return {
          ok: false as const,
          error: error?.message ?? "Could not start session.",
        };
      }
      sessionId = retry.id as string;
    } else {
      sessionId = inserted.id as string;
    }
  }

  // Upsert participant row (refresh last_seen_at on re-join).
  await supabase
    .from("game_session_participants")
    .upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        joined_at: nowIso,
        last_seen_at: nowIso,
      },
      { onConflict: "session_id,user_id" },
    );

  // Ghost-session reclaim: if we just joined an existing active session
  // whose caller is us, or whose caller hasn't heartbeated in >2 min (or
  // never joined as a participant), silently claim the caller role. This
  // handles the common solo-user case of returning to a session the server
  // didn't get to clean up — without it, a single coach can get stuck as a
  // spectator of their own ghost session.
  if (existing) {
    const callerId = (existing.caller_user_id as string | null) ?? null;
    if (callerId === user.id) {
      // Already the caller; nothing to do.
    } else {
      const TWO_MIN_MS = 2 * 60_000;
      let callerStale = true;
      if (callerId) {
        const { data: callerPart } = await supabase
          .from("game_session_participants")
          .select("last_seen_at")
          .eq("session_id", sessionId)
          .eq("user_id", callerId)
          .maybeSingle();
        const seen = callerPart?.last_seen_at as string | null | undefined;
        if (seen) {
          callerStale = Date.now() - new Date(seen).getTime() > TWO_MIN_MS;
        }
      }
      if (callerStale) {
        await supabase
          .from("game_sessions")
          .update({ caller_user_id: user.id, caller_changed_at: nowIso })
          .eq("id", sessionId)
          .eq("status", "active");
      }
    }
  }

  return { ok: true as const, sessionId };
}

/** Heartbeat: refresh last_seen_at so staleness sweeps don't end us. */
export async function heartbeatGameSessionAction(sessionId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  await supabase
    .from("game_session_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("user_id", user.id);
  return { ok: true as const };
}

/** Claim the caller role. Any participant can do this at any time — we
 *  don't require the prior caller to release. Conditional update ensures
 *  the version we read is what we write. */
export async function takeoverCallerAction(sessionId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase
    .from("game_sessions")
    .update({
      caller_user_id: user.id,
      caller_changed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("status", "active");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Any coach in the playbook can update the session's metadata (kind and
 *  opponent). Used by the start/join dialog so late joiners can correct
 *  or fill in values the opener left blank. */
export async function updateGameSessionMetaAction(
  sessionId: string,
  input: { kind: "game" | "scrimmage"; opponent: string | null },
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const kind = input.kind === "scrimmage" ? "scrimmage" : "game";
  const opponent = input.opponent?.trim() || null;

  const { error } = await supabase
    .from("game_sessions")
    .update({ kind, opponent })
    .eq("id", sessionId)
    .eq("status", "active");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Persist a coarse GPS reading captured at game-mode start. Best-effort:
 *  the client fires this opportunistically and ignores failures. We only
 *  write if the session is active and owned by the caller; coords are
 *  clamped to valid ranges so a buggy/spoofed reading can't poison the row. */
export async function setGameSessionVenueAction(
  sessionId: string,
  input: { latitude: number; longitude: number; accuracy: number | null },
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false as const, error: "Invalid coordinates." };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false as const, error: "Coordinates out of range." };
  }
  const accuracy =
    input.accuracy != null && Number.isFinite(input.accuracy) && input.accuracy >= 0
      ? input.accuracy
      : null;

  const { error } = await supabase
    .from("game_sessions")
    .update({
      venue_lat: lat,
      venue_lng: lng,
      venue_accuracy_m: accuracy,
      venue_captured_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("coach_id", user.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Caller sets the next-up play. */
export async function setNextPlayAction(sessionId: string, playId: string | null) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase
    .from("game_sessions")
    .update({ next_play_id: playId })
    .eq("id", sessionId)
    .eq("caller_user_id", user.id)
    .eq("status", "active");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Caller advances: the next-up play becomes current, a call row is
 *  inserted (ready to be scored), next_play_id is cleared. */
export async function advanceToNextPlayAction(sessionId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: session } = await supabase
    .from("game_sessions")
    .select("id, caller_user_id, status, next_play_id, playbook_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false as const, error: "Session not found." };
  if (session.status !== "active") return { ok: false as const, error: "Session ended." };
  if (session.caller_user_id !== user.id) return { ok: false as const, error: "Not caller." };
  const nextPlayId = session.next_play_id as string | null;
  if (!nextPlayId) return { ok: false as const, error: "No next play set." };

  const [{ data: playRow }, { data: lastCall }, snapshot] = await Promise.all([
    supabase
      .from("plays")
      .select("current_version_id")
      .eq("id", nextPlayId)
      .maybeSingle(),
    supabase
      .from("game_plays")
      .select("position")
      .eq("session_id", sessionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
    buildPlaySnapshot(supabase, nextPlayId),
  ]);
  const nextPosition = ((lastCall?.position as number | null) ?? -1) + 1;

  const { error: insertErr } = await supabase.from("game_plays").insert({
    session_id: sessionId,
    play_id: nextPlayId,
    play_version_id: (playRow?.current_version_id as string | null) ?? null,
    position: nextPosition,
    called_at: new Date().toISOString(),
    snapshot,
  });
  if (insertErr) return { ok: false as const, error: insertErr.message };

  const { error: updateErr } = await supabase
    .from("game_sessions")
    .update({ current_play_id: nextPlayId, next_play_id: null })
    .eq("id", sessionId)
    .eq("caller_user_id", user.id);
  if (updateErr) return { ok: false as const, error: updateErr.message };

  return { ok: true as const };
}

/** Caller picks an initial play (before any call exists). */
export async function setInitialPlayAction(sessionId: string, playId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: session } = await supabase
    .from("game_sessions")
    .select("id, caller_user_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "active") {
    return { ok: false as const, error: "Session ended." };
  }
  if (session.caller_user_id !== user.id) return { ok: false as const, error: "Not caller." };

  const { data: existingCall } = await supabase
    .from("game_plays")
    .select("id")
    .eq("session_id", sessionId)
    .limit(1)
    .maybeSingle();

  if (!existingCall) {
    const [{ data: playRow }, snapshot] = await Promise.all([
      supabase
        .from("plays")
        .select("current_version_id")
        .eq("id", playId)
        .maybeSingle(),
      buildPlaySnapshot(supabase, playId),
    ]);
    await supabase.from("game_plays").insert({
      session_id: sessionId,
      play_id: playId,
      play_version_id: (playRow?.current_version_id as string | null) ?? null,
      position: 0,
      called_at: new Date().toISOString(),
      snapshot,
    });
  }

  const { error } = await supabase
    .from("game_sessions")
    .update({ current_play_id: playId })
    .eq("id", sessionId)
    .eq("caller_user_id", user.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Anyone in the session can score the most recent call (last-write-wins). */
export async function scoreCurrentCallAction(
  sessionId: string,
  input: { thumb: "up" | "down" | null; tag: string | null },
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: latest } = await supabase
    .from("game_plays")
    .select("id")
    .eq("session_id", sessionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { ok: false as const, error: "No current call." };

  const tag = sanitizeTag(input.thumb, input.tag);
  const { error } = await supabase
    .from("game_plays")
    .update({ thumb: input.thumb, tag })
    .eq("id", latest.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Caller ends the session. Writes final metadata (opponent, score, notes). */
export async function endGameSessionAction(
  sessionId: string,
  finals: {
    kind: "game" | "scrimmage";
    opponent: string | null;
    scoreUs: number | null;
    scoreThem: number | null;
    notes: string | null;
  },
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const kind = finals.kind === "scrimmage" ? "scrimmage" : "game";

  const { error } = await supabase
    .from("game_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      kind,
      opponent: finals.opponent,
      score_us: finals.scoreUs,
      score_them: finals.scoreThem,
      notes: finals.notes,
    })
    .eq("id", sessionId)
    .eq("caller_user_id", user.id)
    .eq("status", "active");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Caller discards the session without saving any outcome metadata (but
 *  outcomes already recorded stay on disk — there's no recovering history
 *  once flipped to ended). */
export async function discardGameSessionAction(sessionId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase
    .from("game_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("caller_user_id", user.id)
    .eq("status", "active");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Log a score change for the current session. Any playbook coach can
 *  call this — scoring is not gated on being the play caller. `playId`
 *  is the game_plays row on the field when the tap happened, so the
 *  review surface can attribute which play moved the scoreboard. */
export async function logScoreEventAction(
  sessionId: string,
  input: { side: "us" | "them"; delta: number; playId: string | null },
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const side = input.side === "them" ? "them" : "us";
  const delta = Math.trunc(Number(input.delta));
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false as const, error: "Invalid score delta." };
  }

  const { error } = await supabase.from("game_score_events").insert({
    session_id: sessionId,
    play_id: input.playId,
    side,
    delta,
    created_by: user.id,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Spectator leaves the session (caller should use end/discard instead). */
export async function leaveGameSessionAction(sessionId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  await supabase
    .from("game_session_participants")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", user.id);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Legacy save (historical batch save, kept for backwards compat if any
// caller still uses it).
// ---------------------------------------------------------------------------

export async function saveGameSessionAction(input: SaveInput) {
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
      status: "ended",
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
    const snapshotsByPlay = new Map<string, Record<string, unknown>>();
    await Promise.all(
      playIds.map(async (pid) => {
        snapshotsByPlay.set(pid, await buildPlaySnapshot(supabase, pid));
      }),
    );

    const rows = input.calls.map((c, i) => ({
      session_id: sessionId,
      play_id: c.playId,
      play_version_id: versionByPlay.get(c.playId) ?? null,
      position: i,
      called_at: c.calledAt,
      thumb: c.thumb,
      tag: sanitizeTag(c.thumb, c.tag),
      snapshot: snapshotsByPlay.get(c.playId) ?? {},
    }));
    const { error: playsErr } = await supabase.from("game_plays").insert(rows);
    if (playsErr) {
      return { ok: false as const, error: playsErr.message };
    }
  }

  return { ok: true as const, sessionId };
}
