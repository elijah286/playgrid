/**
 * Execute a Leo write proposal the operator approved.
 *
 * Leo never executes a consequential tool itself — the runner captures it as a
 * proposal and the chat shows an Approve button. Tapping it POSTs here, and we
 * run the real tool with the operator's context. Safe because: writes are gated
 * (leagueAiWritesEnabled), the caller must be an operator of the league, and
 * only consequential tools the operator could already run via the UI are
 * allowed. The proposal input is what the operator saw and approved.
 */
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentLeagueMemberships,
  isLeagueAdminRole,
  leagueAiWritesEnabled,
} from "@/lib/league/access";
import { runLeagueTool, LEAGUE_CONSEQUENTIAL_TOOL_NAMES } from "@/lib/league-ai/tools";

type ApproveRequest = {
  leagueId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
};

export async function POST(req: Request): Promise<Response> {
  if (!leagueAiWritesEnabled()) {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: ApproveRequest = {};
  try {
    body = (await req.json()) as ApproveRequest;
  } catch {
    /* handled below */
  }

  const leagueId = String(body.leagueId ?? "");
  const toolName = String(body.toolName ?? "");
  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? body.input
      : {};

  if (!leagueId || !toolName) {
    return NextResponse.json(
      { ok: false, error: "leagueId and toolName are required" },
      { status: 400 },
    );
  }
  // Only consequential (approvable) tools can run here — never a read or unknown.
  if (!LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has(toolName)) {
    return NextResponse.json({ ok: false, error: "Not an approvable action" }, { status: 400 });
  }

  const memberships = await getCurrentLeagueMemberships();
  const membership = memberships.find((m) => m.leagueId === leagueId);
  if (!membership || !isLeagueAdminRole(membership.role)) {
    return NextResponse.json(
      { ok: false, error: "Not authorized for this league" },
      { status: 403 },
    );
  }

  const r = await runLeagueTool(toolName, input, {
    leagueId,
    userId: user.id,
    isLeagueAdmin: true,
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result: r.result });
}
