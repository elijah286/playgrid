/**
 * Clear all turns for the caller's thread in a given (mode, playbook) scope.
 *
 * Mirrors the chat's "trash" button. We keep the thread row so the same
 * scope reuses the same id — only the turns are deleted. Any in-flight
 * `running` turn for this thread will be deleted along with the rest;
 * the SSE on the originating tab will still complete and write to a
 * now-deleted row (silently no-ops, which is fine).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clearThreadTurns,
  getOrCreateThread,
  type CoachAiMode,
} from "@/lib/coach-ai/persistence";

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: { mode?: string; playbookId?: string | null } = {};
  try { body = (await req.json()) as typeof body; } catch { /* empty body OK */ }

  const mode: CoachAiMode = body.mode === "admin_training" ? "admin_training" : "normal";
  const playbookId = mode === "admin_training" ? null : (body.playbookId ?? null);

  const threadId = await getOrCreateThread(user.id, mode, playbookId);
  await clearThreadTurns(threadId);
  return NextResponse.json({ ok: true });
}
