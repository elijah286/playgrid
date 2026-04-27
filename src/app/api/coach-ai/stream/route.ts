import { createClient } from "@/lib/supabase/server";
import { runAgent, type AgentStreamEvent } from "@/lib/coach-ai/agent";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import type { CoachAiMode, ToolContext } from "@/lib/coach-ai/tools";
import { logCoachAiRefusal, logCoachAiKbMiss } from "@/lib/coach-ai/feedback-log";

type StreamRequest = {
  history: { role: "user" | "assistant"; text: string; toolCalls?: string[] }[];
  userMessage: string;
  playbookId?: string | null;
  mode?: CoachAiMode;
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
  isAdmin: boolean,
  mode: CoachAiMode,
): Promise<ToolContext> {
  if (!playbookId) {
    return { playbookId: null, sportVariant: null, gameLevel: null, sanctioningBody: null, ageDivision: null, isAdmin, canEditPlaybook: false, mode };
  }
  const supabase = await createClient();
  const [{ data }, { data: canEdit }] = await Promise.all([
    supabase.from("playbooks")
      .select("sport_variant, game_level, sanctioning_body, age_division")
      .eq("id", playbookId).maybeSingle(),
    supabase.rpc("can_edit_playbook", { pb: playbookId }),
  ]);
  return {
    playbookId,
    sportVariant: (data?.sport_variant as string | null) ?? null,
    gameLevel: (data?.game_level as string | null) ?? null,
    sanctioningBody: (data?.sanctioning_body as string | null) ?? null,
    ageDivision: (data?.age_division as string | null) ?? null,
    isAdmin,
    canEditPlaybook: Boolean(canEdit),
    mode,
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

/**
 * Detect if the response is an out-of-scope refusal.
 * Coach AI is trained to politely refuse requests outside football coaching scope.
 */
function detectOutOfScopeRefusal(text: string): boolean {
  const refusalPatterns = [
    /outside my scope|outside my wheelhouse|outside my lane/i,
    /I'm strictly a football|I'm here for football|I'm a football/i,
    /that's outside my expertise|that's not my area/i,
    /I'm a football coach|I'm a coaching AI/i,
    /not my wheelhouse|not in my scope/i,
    /wrong franchise|that's not.*football|not.*my.*specialty/i,
  ];
  return refusalPatterns.some(p => p.test(text));
}

/**
 * Detect if Coach AI fell back to general knowledge (KB miss).
 * This happens when Coach AI lacks specific KB content and admits it.
 */
function detectKbMiss(text: string): boolean {
  const kbMissPatterns = [
    /isn't my specialty|not my specialty|outside my expertise|aren't my.*expertise|aren't my core|not.*my core/i,
    /don't have specific.*content|don't have.*knowledge/i,
    /I'd recommend|I recommend.*instead|you.*get better.*from/i,
    /check.*official|consult.*league|ask.*athletic director|dedicated.*coach|film study/i,
    /watching film|consulting.*coach|sports performance specialist|coaching.*resources/i,
  ];
  return kbMissPatterns.some(p => p.test(text));
}

/**
 * Log a refusal if detected.
 */
async function logRefusalIfDetected(
  finalText: string,
  userMessage: string,
  ctx: ToolContext,
): Promise<void> {
  if (!detectOutOfScopeRefusal(finalText)) return;
  try {
    await logCoachAiRefusal({
      userRequest: userMessage.slice(0, 500),
      refusalReason: "out_of_scope",
      playbookId: ctx.playbookId,
      sportVariant: ctx.sportVariant,
      sanctioningBody: ctx.sanctioningBody,
      gameLevel: ctx.gameLevel,
      ageDivision: ctx.ageDivision,
    });
  } catch {
    // Don't fail the chat on logging error
  }
}

/**
 * Log a KB miss if detected.
 */
async function logKbMissIfDetected(
  finalText: string,
  userMessage: string,
  ctx: ToolContext,
): Promise<void> {
  if (!detectKbMiss(finalText)) return;
  try {
    await logCoachAiKbMiss({
      topic: userMessage.slice(0, 100),
      userQuestion: userMessage.slice(0, 500),
      reason: "weak_results",
      playbookId: ctx.playbookId,
      sportVariant: ctx.sportVariant,
      sanctioningBody: ctx.sanctioningBody,
      gameLevel: ctx.gameLevel,
      ageDivision: ctx.ageDivision,
    });
  } catch {
    // Don't fail the chat on logging error
  }
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

  const [ctx] = await Promise.all([
    loadToolContext(body.playbookId ?? null, gate.isAdmin, requestedMode),
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

        // Log feedback and usage asynchronously — don't block the response
        recordUsage(gate.userId).catch(() => { /* non-critical */ });
        logRefusalIfDetected(result.finalText, text, ctx).catch(() => { /* non-critical */ });
        logKbMissIfDetected(result.finalText, text, ctx).catch(() => { /* non-critical */ });

        send("done", { toolCalls: result.toolCalls, text: result.finalText, playbookChips: result.playbookChips ?? null });
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
