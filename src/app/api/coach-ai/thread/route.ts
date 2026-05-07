/**
 * Load the coach's chat thread for a given (mode, playbook) scope.
 *
 * Replaces the localStorage-only history path. The client calls this on
 * mount and renders the returned turns + flags any running turn so the
 * "Cal is still thinking…" indicator fires before any new send.
 *
 * Empty thread is OK — that's the cue for the client to fall back to
 * localStorage history (which gets backfilled on the first send).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateThread,
  loadThreadTurns,
  toClientTurn,
  type CoachAiMode,
} from "@/lib/coach-ai/persistence";
import type { CoachAiTurn } from "@/app/actions/coach-ai";

export async function GET(req: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const modeParam = url.searchParams.get("mode") ?? "normal";
  const mode: CoachAiMode = modeParam === "admin_training" ? "admin_training" : "normal";
  const playbookId =
    mode === "admin_training" ? null : (url.searchParams.get("playbookId") || null);

  const threadId = await getOrCreateThread(user.id, mode, playbookId);
  const serverTurns = await loadThreadTurns(threadId);

  const clientTurns: CoachAiTurn[] = [];
  let runningTurnId: string | null = null;
  let lastErroredText: string | null = null;
  for (const t of serverTurns) {
    if (t.status === "running") {
      runningTurnId = t.id;
      continue;
    }
    if (t.status === "errored") {
      // Errored assistant turns don't appear in history (they didn't
      // produce a real reply). The client gets the error message via
      // `lastError` so it can flash a banner if the coach just returned.
      lastErroredText = t.error;
      continue;
    }
    const c = toClientTurn(t);
    if (c) clientTurns.push(c);
  }

  return NextResponse.json({
    ok: true,
    threadId,
    turns: clientTurns,
    runningTurnId,
    lastError: lastErroredText,
  });
}
