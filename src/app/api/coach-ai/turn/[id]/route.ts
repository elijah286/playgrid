/**
 * Poll a single Coach Cal turn for completion.
 *
 * The chat client polls this every ~1.5s while a running turn is in
 * flight (typically because the user closed and reopened the window).
 * Once the row's status flips to 'done' or 'errored', the client
 * appends the finished assistant turn to its visible history and stops
 * polling.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTurn, toClientTurn } from "@/lib/coach-ai/persistence";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const turn = await getTurn(id);
  if (!turn) {
    return NextResponse.json({ ok: false, error: "Turn not found" }, { status: 404 });
  }
  // RLS already guards this; the explicit check is defense-in-depth and
  // produces a clean 403 instead of a generic empty result.
  if (turn.role !== "user" && turn.role !== "assistant") {
    return NextResponse.json({ ok: false, error: "Unsupported turn" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    status: turn.status,
    turn: turn.status === "done" ? toClientTurn(turn) : null,
    mutated: turn.mutated,
    error: turn.error,
  });
}
