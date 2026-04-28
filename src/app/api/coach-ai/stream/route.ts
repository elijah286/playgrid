import { createClient } from "@/lib/supabase/server";
import { runAgent, type AgentStreamEvent } from "@/lib/coach-ai/agent";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
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
  if (playId) {
    const { data: playRow } = await supabase
      .from("plays")
      .select("id, name, formation_name, playbook_id")
      .eq("id", playId)
      .maybeSingle();
    if (playRow) {
      resolvedPlay = {
        id: playRow.id as string,
        name: (playRow.name as string | null) ?? null,
        formation: (playRow.formation_name as string | null) ?? null,
        playbookId: (playRow.playbook_id as string | null) ?? null,
      };
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

  const requestedMode: CoachAiMode =
    body.mode === "admin_training" ? "admin_training"
      : body.mode === "playbook_training" ? "playbook_training"
      : "normal";

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
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(sseChunk(event, data)));
      };

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
          mutated: result.mutated,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        send("error", { message: msg });
      } finally {
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
