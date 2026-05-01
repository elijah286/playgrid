import { createClient } from "@/lib/supabase/server";
import { runAgent, type AgentStreamEvent } from "@/lib/coach-ai/agent";
import { playDocumentToCoachDiagram } from "@/lib/coach-ai/play-tools";
import type { PlayDocument } from "@/domain/play/types";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { getCoachCalCapState } from "@/lib/billing/coach-cal-cap";
import type { CoachAiMode, ToolContext } from "@/lib/coach-ai/tools";

type StreamRequest = {
  history: { role: "user" | "assistant"; text: string; toolCalls?: string[] }[];
  userMessage: string;
  playbookId?: string | null;
  /** Set by the chat when the launcher is open from within the play editor. */
  playId?: string | null;
  mode?: CoachAiMode;
  timezone?: string | null;
};

function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function turnsToHistory(turns: StreamRequest["history"]): ChatMessage[] {
  return turns.map((t) =>
    t.role === "user"
      ? ({ role: "user", content: t.text } satisfies ChatMessage)
      : ({ role: "assistant", content: [{ type: "text", text: t.text } satisfies ContentBlock] } satisfies ChatMessage),
  );
}

async function loadCallerInfo(): Promise<
  | { ok: true; userId: string; isAdmin: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";
  const beta = await getBetaFeatures();
  const available = isBetaFeatureAvailable(beta.coach_ai, { isAdmin, isEntitled: true });
  if (!available) return { ok: false, error: "Coach AI is not enabled for your account." };
  return { ok: true, userId: user.id, isAdmin };
}

async function loadToolContext(
  playbookId: string | null,
  playId: string | null,
  isAdmin: boolean,
  mode: CoachAiMode,
  timezone: string | null,
): Promise<ToolContext> {
  const supabase = await createClient();

  // Resolve play first — if the chat was opened from the editor we have a
  // playId but might not have a playbookId from the URL. The play row tells
  // us its parent playbook, which we then anchor to like normal.
  let resolvedPlay: { id: string; name: string | null; formation: string | null; playbookId: string | null } | null = null;
  let playDiagramText: string | null = null;
  if (playId) {
    const { data: playRow } = await supabase
      .from("plays")
      .select("id, name, formation_name, playbook_id, current_version_id")
      .eq("id", playId)
      .is("attached_to_play_id", null)
      .maybeSingle();
    if (playRow) {
      resolvedPlay = {
        id: playRow.id as string,
        name: (playRow.name as string | null) ?? null,
        formation: (playRow.formation_name as string | null) ?? null,
        playbookId: (playRow.playbook_id as string | null) ?? null,
      };
      const versionId = (playRow.current_version_id as string | null) ?? null;
      if (versionId) {
        const { data: version } = await supabase
          .from("play_versions")
          .select("document")
          .eq("id", versionId)
          .maybeSingle();
        const doc = (version?.document ?? null) as PlayDocument | null;
        if (doc) {
          try {
            const diagram = playDocumentToCoachDiagram(doc, resolvedPlay.name ?? "play");
            playDiagramText = JSON.stringify(diagram);
          } catch { /* malformed doc — fall back to no diagram, model can still call get_play */ }
        }
      }
    }
  }

  const effectivePlaybookId = playbookId ?? resolvedPlay?.playbookId ?? null;

  if (!effectivePlaybookId) {
    return {
      playbookId: null, playbookName: null, sportVariant: null, gameLevel: null,
      sanctioningBody: null, ageDivision: null, isAdmin, canEditPlaybook: false, mode,
      timezone,
      playId: resolvedPlay?.id ?? null,
      playName: resolvedPlay?.name ?? null,
      playFormation: resolvedPlay?.formation ?? null,
      playDiagramText,
    };
  }
  const [{ data }, { data: canEdit }] = await Promise.all([
    supabase.from("playbooks")
      .select("name, sport_variant, game_level, sanctioning_body, age_division")
      .eq("id", effectivePlaybookId).maybeSingle(),
    supabase.rpc("can_edit_playbook", { pb: effectivePlaybookId }),
  ]);
  return {
    playbookId: effectivePlaybookId,
    playbookName: (data?.name as string | null) ?? null,
    sportVariant: (data?.sport_variant as string | null) ?? null,
    gameLevel: (data?.game_level as string | null) ?? null,
    sanctioningBody: (data?.sanctioning_body as string | null) ?? null,
    ageDivision: (data?.age_division as string | null) ?? null,
    isAdmin,
    canEditPlaybook: Boolean(canEdit),
    mode,
    timezone,
    playId: resolvedPlay?.id ?? null,
    playName: resolvedPlay?.name ?? null,
    playFormation: resolvedPlay?.formation ?? null,
    playDiagramText,
  };
}

async function recordUsage(userId: string): Promise<void> {
  const supabase = await createClient();
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const monthStr = month.toISOString().slice(0, 10);
  await supabase.rpc("increment_coach_ai_usage", { p_user_id: userId, p_month: monthStr });
}

export async function POST(req: Request): Promise<Response> {
  const gate = await loadCallerInfo();
  if (!gate.ok) {
    return new Response(
      sseChunk("error", { message: gate.error }) + sseChunk("done", { toolCalls: [], text: "" }),
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }

  let body: StreamRequest;
  try {
    body = await req.json() as StreamRequest;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const text = body.userMessage.trim();
  if (!text) {
    return new Response(
      sseChunk("error", { message: "Empty message." }),
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }

  // Hard cap on Coach Cal usage. The meter is purely informational —
  // this is the only enforcement point. Returns a structured payload
  // so the chat client can render the buy/wait CTAs without parsing
  // the message text.
  const cap = await getCoachCalCapState(gate.userId);
  if (cap.exceeded) {
    return new Response(
      sseChunk("error", {
        message: `You've used all ${cap.limit} Coach Cal messages this month. Buy a pack for more, or wait until the period resets.`,
        code: "out_of_messages",
        count: cap.count,
        limit: cap.limit,
        resetDate: cap.resetDate,
        pack: cap.pack,
      }) +
        sseChunk("done", { toolCalls: [], text: "" }),
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }

  const requestedMode: CoachAiMode =
    body.mode === "admin_training" ? "admin_training" : "normal";

  const tz = typeof body.timezone === "string" && body.timezone ? body.timezone : null;
  const [ctx] = await Promise.all([
    loadToolContext(body.playbookId ?? null, body.playId ?? null, gate.isAdmin, requestedMode, tz),
  ]);

  const history: ChatMessage[] = [
    ...turnsToHistory(body.history),
    { role: "user", content: text },
  ];

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(enc.encode(sseChunk(event, data)));
      };

      // Heartbeat: SSE comment frames every 15s so Railway's edge proxy
      // never sees the stream as idle. Long agent turns (multi-tool fan-out
      // like "create three plays") can spend 30+s inside a single chat()
      // call — buffered for diagram validation, so no text_delta escapes —
      // and the proxy was cutting the connection, surfacing in the browser
      // as "Load failed". Comment frames (`: ...\n\n`) are ignored by the
      // client SSE parser (no `data:` line → no yield) so they don't
      // perturb the message stream.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(": keepalive\n\n"));
        } catch { /* controller already closed */ }
      }, 15_000);

      try {
        const result = await runAgent(history, ctx, (e: AgentStreamEvent) => {
          if (e.type === "status")     send("status",     { text: e.text });
          if (e.type === "tool_call")  send("tool_call",  { name: e.name });
          if (e.type === "text_delta") send("text_delta", { text: e.text });
        });

        // Record usage asynchronously — don't block the response
        recordUsage(gate.userId).catch(() => { /* non-critical */ });

        // KB-miss + refusal logging now happens via the silent flag_outside_kb
        // and flag_refusal tools the agent calls directly — no post-hoc text
        // parsing needed.
        send("done", {
          toolCalls: result.toolCalls,
          text: result.finalText,
          playbookChips: result.playbookChips ?? null,
          noteProposals: result.noteProposals ?? null,
          mutated: result.mutated,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        send("error", { message: msg });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
