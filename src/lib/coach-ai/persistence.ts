/**
 * Server-side persistence for Coach Cal chat history.
 *
 * One thread per (user, mode, playbook). Turns are 1:1 with the client's
 * `CoachAiTurn` shape. Assistant turns start `running` and flip to
 * `done`/`errored` when the detached agent promise completes — so the
 * client can poll the row after the SSE connection closes and pick up
 * the result on return.
 *
 * Writes use the service-role client because the agent finishes AFTER
 * the request returns (cookies/session are gone by then). Reads use the
 * user-scoped client so RLS does the auth.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { NoteProposal } from "@/lib/coach-ai/playbook-tools";
import type { CoachAiTurn, NoteProposalSavedState, PlaybookChip } from "@/app/actions/coach-ai";

export type CoachAiMode = "normal" | "admin_training";
export type CoachAiTurnStatus = "running" | "done" | "errored";

export type ServerCoachAiTurn = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  status: CoachAiTurnStatus;
  text: string;
  toolCalls: string[];
  playbookChips: PlaybookChip[] | null;
  noteProposals: NoteProposal[] | null;
  noteProposalState: Record<string, NoteProposalSavedState> | null;
  mutated: boolean;
  playId: string | null;
  error: string | null;
  createdAt: string;
  endedAt: string | null;
};

/**
 * A turn that has been "running" for longer than this is treated as
 * errored on read. Covers the case where the Node process crashed or
 * was redeployed mid-agent — without this, the row would sit running
 * forever and the client would poll indefinitely. Picked to comfortably
 * exceed the runAgent timeout (4 min, see stream/route.ts).
 */
const STALE_RUNNING_TURN_MS = 6 * 60 * 1000;

export async function getOrCreateThread(
  userId: string,
  mode: CoachAiMode,
  playbookId: string | null,
): Promise<string> {
  const sb = createServiceRoleClient();

  // Try to find existing thread first — separate from insert because the
  // partial unique indexes on (user, mode, null) and (user, mode, pb)
  // can't both be referenced in a single ON CONFLICT clause.
  const lookup = sb
    .from("coach_ai_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("mode", mode);
  const { data: existing } = playbookId
    ? await lookup.eq("playbook_id", playbookId).maybeSingle()
    : await lookup.is("playbook_id", null).maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await sb
    .from("coach_ai_threads")
    .insert({ user_id: userId, mode, playbook_id: playbookId })
    .select("id")
    .single();
  if (error) {
    // Race: another concurrent request may have created the thread between
    // our lookup and our insert. Re-read once to recover.
    const retry = sb
      .from("coach_ai_threads")
      .select("id")
      .eq("user_id", userId)
      .eq("mode", mode);
    const { data: row } = playbookId
      ? await retry.eq("playbook_id", playbookId).maybeSingle()
      : await retry.is("playbook_id", null).maybeSingle();
    if (row?.id) return row.id as string;
    throw error;
  }
  return data.id as string;
}

export async function isThreadEmpty(threadId: string): Promise<boolean> {
  const sb = createServiceRoleClient();
  const { count } = await sb
    .from("coach_ai_turns")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  return (count ?? 0) === 0;
}

/**
 * One-time backfill of the client's localStorage history when the server
 * thread is empty. Called from the stream route on the very first send
 * after this feature ships, so coaches don't lose their existing chat.
 *
 * The `history` shape matches what the client persists in localStorage:
 * minimal `{ role, text, toolCalls? }`. We don't try to recover playbook
 * chips, note proposals, or any of the richer assistant metadata — those
 * weren't persisted client-side anyway.
 */
export async function backfillHistory(
  threadId: string,
  userId: string,
  history: ReadonlyArray<{ role: "user" | "assistant"; text: string; toolCalls?: string[] }>,
): Promise<void> {
  if (history.length === 0) return;
  const sb = createServiceRoleClient();
  // Backfill in order with sequential timestamps so ORDER BY created_at
  // preserves the original conversation flow. Stamp them slightly in the
  // past so the new turn (about to be inserted) comes after them.
  const baseTime = Date.now() - history.length * 100;
  const rows = history.map((t, i) => ({
    thread_id: threadId,
    user_id: userId,
    role: t.role,
    status: "done" as const,
    text: t.text,
    tool_calls: t.toolCalls ?? null,
    created_at: new Date(baseTime + i * 100).toISOString(),
    ended_at: new Date(baseTime + i * 100).toISOString(),
  }));
  const { error } = await sb.from("coach_ai_turns").insert(rows);
  if (error) throw error;
}

export async function insertUserTurn(
  threadId: string,
  userId: string,
  text: string,
  playId: string | null,
): Promise<string> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("coach_ai_turns")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: "user",
      status: "done",
      text,
      play_id: playId,
      ended_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  await touchThread(threadId);
  return data.id as string;
}

export async function insertRunningAssistantTurn(
  threadId: string,
  userId: string,
  playId: string | null,
): Promise<string> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("coach_ai_turns")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: "assistant",
      status: "running",
      text: "",
      play_id: playId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function completeAssistantTurn(
  turnId: string,
  payload: {
    text: string;
    toolCalls: string[];
    playbookChips: PlaybookChip[] | null;
    noteProposals: NoteProposal[] | null;
    mutated: boolean;
  },
): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("coach_ai_turns")
    .update({
      status: "done",
      text: payload.text,
      tool_calls: payload.toolCalls,
      playbook_chips: payload.playbookChips,
      note_proposals: payload.noteProposals,
      mutated: payload.mutated,
      ended_at: new Date().toISOString(),
    })
    .eq("id", turnId);
  if (error) throw error;
  // touchThread is best-effort — if it fails the turn still ended cleanly.
  await touchThreadByTurn(turnId).catch(() => {});
}

export async function failAssistantTurn(turnId: string, errorMessage: string): Promise<void> {
  const sb = createServiceRoleClient();
  await sb
    .from("coach_ai_turns")
    .update({
      status: "errored",
      error: errorMessage.slice(0, 2000), // bound DB write
      ended_at: new Date().toISOString(),
    })
    .eq("id", turnId);
}

async function touchThread(threadId: string): Promise<void> {
  const sb = createServiceRoleClient();
  await sb
    .from("coach_ai_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);
}

async function touchThreadByTurn(turnId: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { data } = await sb.from("coach_ai_turns").select("thread_id").eq("id", turnId).maybeSingle();
  if (data?.thread_id) await touchThread(data.thread_id as string);
}

/**
 * Promote stale `running` turns to `errored`. A turn that's been running
 * past STALE_RUNNING_TURN_MS almost certainly means the Node process
 * crashed or restarted mid-agent — the client would poll forever
 * otherwise. Run lazily from the read paths (cheap; partial index makes
 * the scan tiny).
 */
async function promoteStaleRunningTurns(): Promise<void> {
  const sb = createServiceRoleClient();
  const cutoff = new Date(Date.now() - STALE_RUNNING_TURN_MS).toISOString();
  await sb
    .from("coach_ai_turns")
    .update({
      status: "errored",
      error: "Coach Cal didn't finish in time. Try again.",
      ended_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("created_at", cutoff);
}

function rowToTurn(row: Record<string, unknown>): ServerCoachAiTurn {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    role: row.role as "user" | "assistant",
    status: row.status as CoachAiTurnStatus,
    text: (row.text as string | null) ?? "",
    toolCalls: (row.tool_calls as string[] | null) ?? [],
    playbookChips: (row.playbook_chips as PlaybookChip[] | null) ?? null,
    noteProposals: (row.note_proposals as NoteProposal[] | null) ?? null,
    noteProposalState: (row.note_proposal_state as Record<string, NoteProposalSavedState> | null) ?? null,
    mutated: (row.mutated as boolean | null) ?? false,
    playId: (row.play_id as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: row.created_at as string,
    endedAt: (row.ended_at as string | null) ?? null,
  };
}

/**
 * Load the thread's full history, with stale-running guard applied first.
 * Reads use the user-scoped client so RLS enforces ownership.
 */
export async function loadThreadTurns(
  threadId: string,
): Promise<ServerCoachAiTurn[]> {
  await promoteStaleRunningTurns();
  const sb = await createClient();
  const { data, error } = await sb
    .from("coach_ai_turns")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToTurn);
}

/** Server-truth → client `CoachAiTurn`. Drops 'running' / 'errored' rows
 * since the client's history shape doesn't represent them — those are
 * exposed separately as `runningTurn` / `error` on the thread response. */
export function toClientTurn(turn: ServerCoachAiTurn): CoachAiTurn | null {
  if (turn.status !== "done") return null;
  if (turn.role === "user") {
    return { role: "user", text: turn.text, playId: turn.playId };
  }
  return {
    role: "assistant",
    text: turn.text,
    toolCalls: turn.toolCalls,
    playbookChips: turn.playbookChips,
    noteProposals: turn.noteProposals,
    noteProposalState: turn.noteProposalState,
    playId: turn.playId,
  };
}

export async function getTurn(turnId: string): Promise<ServerCoachAiTurn | null> {
  await promoteStaleRunningTurns();
  const sb = await createClient();
  const { data } = await sb.from("coach_ai_turns").select("*").eq("id", turnId).maybeSingle();
  return data ? rowToTurn(data) : null;
}

/** Used by the "trash" button — wipe the thread's turns but keep the row
 * so the same scope reuses the same thread id. */
export async function clearThreadTurns(threadId: string): Promise<void> {
  const sb = createServiceRoleClient();
  await sb.from("coach_ai_turns").delete().eq("thread_id", threadId);
}
