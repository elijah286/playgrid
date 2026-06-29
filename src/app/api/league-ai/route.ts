/**
 * Leo chat endpoint (league-operator AI assistant), v1.
 *
 * Non-streaming: POST a message + prior history, get back the assistant's reply.
 * Gated behind `leagueAiEnabled()` (default OFF) so it ships dark. Operator-only
 * because Leo's read tools expose league-wide data. No persistence yet — the
 * client holds history (localStorage) and sends it each turn.
 */
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentLeagueMemberships,
  isLeagueAdminRole,
  leagueAiEnabled,
} from "@/lib/league/access";
import { runLeagueAgent, type LeoTurn } from "@/lib/league-ai/runner";

type LeoRequest = {
  leagueId?: string;
  history?: LeoTurn[];
  userMessage?: string;
};

const MAX_HISTORY = 24;
const MAX_MSG_CHARS = 4000;

export async function POST(req: Request): Promise<Response> {
  // Dark by default — the gate returns 404 so the surface is invisible.
  if (!leagueAiEnabled()) {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: LeoRequest = {};
  try {
    body = (await req.json()) as LeoRequest;
  } catch {
    /* empty body handled below */
  }

  const leagueId = String(body.leagueId ?? "");
  const userMessage = String(body.userMessage ?? "").trim().slice(0, MAX_MSG_CHARS);
  if (!leagueId || !userMessage) {
    return NextResponse.json(
      { ok: false, error: "leagueId and userMessage are required" },
      { status: 400 },
    );
  }

  // Operator-only: Leo's read tools surface league-wide data (rosters, contacts).
  const memberships = await getCurrentLeagueMemberships();
  const membership = memberships.find((m) => m.leagueId === leagueId);
  if (!membership || !isLeagueAdminRole(membership.role)) {
    return NextResponse.json(
      { ok: false, error: "Not authorized for this league" },
      { status: 403 },
    );
  }

  const history: LeoTurn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is LeoTurn =>
            !!t &&
            (t.role === "user" || t.role === "assistant") &&
            typeof t.text === "string",
        )
        .slice(-MAX_HISTORY)
        .map((t) => ({ role: t.role, text: String(t.text).slice(0, MAX_MSG_CHARS) }))
    : [];

  try {
    const result = await runLeagueAgent(history, userMessage, {
      leagueId,
      userId: user.id,
      isLeagueAdmin: true,
    });
    return NextResponse.json({ ok: true, text: result.text, toolCalls: result.toolCalls });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Leo had a problem.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
