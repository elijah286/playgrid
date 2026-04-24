import type { PlayOutcome, ThumbsDownTag, ThumbsUpTag } from "./types";

export type GameKind = "game" | "scrimmage";

/** Wire shape for a live or just-loaded game session. */
export type LiveGameSession = {
  id: string;
  playbookId: string;
  status: "active" | "ended";
  callerUserId: string | null;
  currentPlayId: string | null;
  nextPlayId: string | null;
  startedAt: string;
  kind: GameKind;
  opponent: string | null;
};

/** One logged call inside a session. Position is 0-based and monotonic. */
export type LiveGameCall = {
  id: string;
  playId: string;
  position: number;
  calledAt: string;
  thumb: "up" | "down" | null;
  tag: string | null;
};

/** Who is connected to the session right now. Names resolved client-side
 *  from the profiles table (only co-members of the playbook are readable
 *  by RLS). */
export type LiveParticipant = {
  userId: string;
  displayName: string | null;
  lastSeenAt: string;
};

/** Project a call row's thumb+tag into the client-side PlayOutcome shape
 *  the existing scoring UI uses. Unknown/invalid tag strings are dropped. */
export function callToOutcome(call: LiveGameCall | undefined | null): PlayOutcome {
  if (!call || !call.thumb) return null;
  if (call.thumb === "up") {
    const tag = call.tag as ThumbsUpTag | null;
    return { thumb: "up", tag: tag ?? null };
  }
  const tag = call.tag as ThumbsDownTag | null;
  return { thumb: "down", tag: tag ?? null };
}
