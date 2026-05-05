import { createClient } from "@/lib/supabase/server";
import { runAgent, type AgentStreamEvent } from "@/lib/coach-ai/agent";
import { playDocumentToCoachDiagram } from "@/lib/coach-ai/play-tools";
import { recapCoachDiagram } from "@/lib/coach-ai/diagram-recap";
import type { PlayDocument } from "@/domain/play/types";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { getCoachCalCapState } from "@/lib/billing/coach-cal-cap";
import type { CoachAiMode, ToolContext } from "@/lib/coach-ai/tools";
import { normalizePlaybookSettings } from "@/domain/playbook/settings";

type StreamRequest = {
  history: { role: "user" | "assistant"; text: string; toolCalls?: string[] }[];
  userMessage: string;
  playbookId?: string | null;
  /** Set by the chat when the launcher is open from within the play editor. */
  playId?: string | null;
  /**
   * The editor's in-memory PlayDocument when the chat is open from a play
   * route. The autosave debounce can defer persistence by up to 30s while a
   * selection is active; without this, Cal queries play_versions and sees the
   * pre-edit version, then "corrects" the coach with stale labels/colors.
   * We trust this only for the diagram Cal shows the model — never for
   * authorization or persistence.
   */
  livePlayDoc?: PlayDocument | null;
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
  const entitlement = await getCurrentEntitlement();
  const isEntitled = isAdmin || (entitlement?.tier ?? "free") === "coach_ai";
  if (!isEntitled) return { ok: false, error: "Coach Cal requires a Coach Pro subscription." };
  return { ok: true, userId: user.id, isAdmin };
}

async function loadToolContext(
  playbookId: string | null,
  playId: string | null,
  livePlayDoc: PlayDocument | null,
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
  let playDiagramRecap: string | null = null;
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
      // Prefer the client's live doc when available — it reflects edits the
      // autosave debounce has not yet persisted. Fall back to play_versions
      // when no editor is mounted (e.g. the chat is opened from a list view).
      let doc: PlayDocument | null = livePlayDoc ?? null;
      if (!doc) {
        const versionId = (playRow.current_version_id as string | null) ?? null;
        if (versionId) {
          const { data: version } = await supabase
            .from("play_versions")
            .select("document")
            .eq("id", versionId)
            .maybeSingle();
          doc = (version?.document ?? null) as PlayDocument | null;
        }
      }
      if (doc) {
        try {
          const diagram = playDocumentToCoachDiagram(doc, resolvedPlay.name ?? "play");
          playDiagramText = JSON.stringify(diagram);
          playDiagramRecap = recapCoachDiagram(diagram);
        } catch { /* malformed doc — fall back to no diagram, model can still call get_play */ }
      }
    }
  }

  const effectivePlaybookId = playbookId ?? resolvedPlay?.playbookId ?? null;

  if (!effectivePlaybookId) {
    return {
      playbookId: null, playbookName: null, sportVariant: null, gameLevel: null,
      sanctioningBody: null, ageDivision: null, playbookSettings: null,
      isAdmin, canEditPlaybook: false, mode,
      timezone,
      playId: resolvedPlay?.id ?? null,
      playName: resolvedPlay?.name ?? null,
      playFormation: resolvedPlay?.formation ?? null,
      playDiagramText,
      playDiagramRecap,
    };
  }
  const [{ data }, { data: canEdit }] = await Promise.all([
    supabase.from("playbooks")
      .select("name, sport_variant, game_level, sanctioning_body, age_division, settings, custom_offense_count")
      .eq("id", effectivePlaybookId).maybeSingle(),
    supabase.rpc("can_edit_playbook", { pb: effectivePlaybookId }),
  ]);
  const variant = (data?.sport_variant as string | null) ?? null;
  const settings = variant
    ? normalizePlaybookSettings(
        data?.settings,
        variant as Parameters<typeof normalizePlaybookSettings>[1],
        (data?.custom_offense_count as number | null) ?? null,
      )
    : null;
  return {
    playbookId: effectivePlaybookId,
    playbookName: (data?.name as string | null) ?? null,
    sportVariant: variant,
    gameLevel: (data?.game_level as string | null) ?? null,
    sanctioningBody: (data?.sanctioning_body as string | null) ?? null,
    ageDivision: (data?.age_division as string | null) ?? null,
    playbookSettings: settings,
    isAdmin,
    canEditPlaybook: Boolean(canEdit),
    mode,
    timezone,
    playId: resolvedPlay?.id ?? null,
    playName: resolvedPlay?.name ?? null,
    playFormation: resolvedPlay?.formation ?? null,
    playDiagramText,
    playDiagramRecap,
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
  // Treat the client's live doc as a hint about the in-memory editor state —
  // not as authoritative for anything but the diagram Cal sees. We don't
  // persist it, and any tool call that mutates the play still goes through
  // the normal save path with full validation. Shape-validation is
  // best-effort: the renderer (`playDocumentToCoachDiagram`) is wrapped in a
  // try/catch and we fall through to the persisted doc when it throws.
  const livePlayDoc =
    body.livePlayDoc != null && typeof body.livePlayDoc === "object"
      ? (body.livePlayDoc as PlayDocument)
      : null;
  const [ctx] = await Promise.all([
    loadToolContext(body.playbookId ?? null, body.playId ?? null, livePlayDoc, gate.isAdmin, requestedMode, tz),
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

      // Hard cap on a single runAgent call. Surfaced 2026-05-02: a coach
      // saw the prose render but the chat UI stay in "thinking" pulse for
      // several minutes. Most likely cause is a deploy mid-stream
      // interrupting the agent loop; without a timeout the SSE connection
      // hangs open and the client never sees `done`. 4 minutes covers
      // even the slowest legitimate Opus 4.7 multi-tool turn (typical:
      // 20-60s) with comfortable headroom; anything longer is almost
      // certainly a hang.
      const AGENT_TIMEOUT_MS = 4 * 60 * 1000;

      try {
        const result = await Promise.race([
          runAgent(history, ctx, (e: AgentStreamEvent) => {
            if (e.type === "status")     send("status",     { text: e.text });
            if (e.type === "tool_call")  send("tool_call",  { name: e.name });
            if (e.type === "text_delta") send("text_delta", { text: e.text });
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`coach-ai agent timed out after ${AGENT_TIMEOUT_MS / 1000}s`)),
              AGENT_TIMEOUT_MS,
            ),
          ),
        ]);

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
        // Always emit a `done` after an error too — this is the
        // belt-and-suspenders companion to the timeout. Even when the
        // agent threw mid-stream (LLM API drop, tool crash), the client
        // needs to leave its "thinking" state. Without a `done`, the
        // pulsing UI stays up indefinitely (surfaced 2026-05-02).
        send("done", {
          toolCalls: [],
          text: "",
          playbookChips: null,
          noteProposals: null,
          mutated: false,
        });
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
