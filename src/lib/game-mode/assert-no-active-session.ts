import type { SupabaseClient } from "@supabase/supabase-js";

/** Heartbeat staleness cutoff: if no participant in an active session has
 *  pinged within this window, the session is considered dead and we
 *  auto-end it so the edit lock doesn't lock coaches out forever. */
export const GAME_SESSION_HEARTBEAT_STALE_MINUTES = 45;

/** Error code returned to the client when a play/playbook mutation is
 *  blocked because a game session is active. The client catches this and
 *  shows the "Game mode in progress" dialog. */
export const GAME_MODE_LOCKED_CODE = "GAME_MODE_LOCKED" as const;

export type GameModeLockInfo = {
  sessionId: string;
  playbookId: string;
  callerName: string | null;
  callerUserId: string | null;
  startedAt: string;
};

export type GameModeLockResult =
  | { locked: false }
  | { locked: true; lock: GameModeLockInfo };

/**
 * Check whether a playbook has a live game session. Call this at the top of
 * every play/playbook mutation action. If a session is active:
 *   - If its last heartbeat is older than GAME_SESSION_HEARTBEAT_STALE_MINUTES,
 *     auto-end it and return `{ locked: false }`. Coaches who left a stale
 *     session open on a phone shouldn't lock the team out.
 *   - Otherwise return `{ locked: true, lock: {...} }` with caller info so
 *     the client can show a dialog inviting the coach to join and help score.
 */
export async function assertNoActiveGameSession(
  supabase: SupabaseClient,
  playbookId: string,
): Promise<GameModeLockResult> {
  const { data: session } = await supabase
    .from("game_sessions")
    .select("id, playbook_id, caller_user_id, started_at")
    .eq("playbook_id", playbookId)
    .eq("status", "active")
    .maybeSingle();

  if (!session) return { locked: false };

  const { data: lastSeen } = await supabase
    .from("game_session_participants")
    .select("last_seen_at")
    .eq("session_id", session.id)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const staleCutoff = Date.now() - GAME_SESSION_HEARTBEAT_STALE_MINUTES * 60_000;
  const lastSeenMs = lastSeen?.last_seen_at
    ? new Date(lastSeen.last_seen_at as string).getTime()
    : new Date(session.started_at as string).getTime();

  if (lastSeenMs < staleCutoff) {
    // Stale — sweep it. RLS: caller must be a coach on the playbook for the
    // UPDATE to succeed; if we're here from a mutation action, we already
    // are, so this is safe.
    await supabase
      .from("game_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("status", "active");
    return { locked: false };
  }

  const callerId = (session.caller_user_id as string | null) ?? null;
  let callerName: string | null = null;
  if (callerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", callerId)
      .maybeSingle();
    callerName = (profile?.display_name as string | null) ?? null;
  }

  return {
    locked: true,
    lock: {
      sessionId: session.id as string,
      playbookId: session.playbook_id as string,
      callerName,
      callerUserId: callerId,
      startedAt: session.started_at as string,
    },
  };
}

/** Shape of the `{ ok: false }` return when a mutation was blocked by an
 *  active game session. Clients narrow on `code === GAME_MODE_LOCKED_CODE`. */
export type GameModeLockedResult = {
  ok: false;
  error: string;
  code: typeof GAME_MODE_LOCKED_CODE;
  gameLock: GameModeLockInfo;
};

/** Build the standardized blocked-return shape used by every guarded action. */
export function gameModeLockedResult(lock: GameModeLockInfo): GameModeLockedResult {
  const who = lock.callerName ?? "Another coach";
  return {
    ok: false,
    error: `${who} is running Game Mode on this playbook. Join from the playbook page to help score — editing is locked until the game ends.`,
    code: GAME_MODE_LOCKED_CODE,
    gameLock: lock,
  };
}
