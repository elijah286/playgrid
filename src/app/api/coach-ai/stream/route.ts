import { createClient } from "@/lib/supabase/server";
import { runAgent, type AgentStreamEvent } from "@/lib/coach-ai/agent";
import { playDocumentToCoachDiagram } from "@/lib/coach-ai/play-tools";
import { recapCoachDiagram } from "@/lib/coach-ai/diagram-recap";
import type { PlayDocument } from "@/domain/play/types";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { canUseAiFeatures } from "@/lib/billing/features";
import { getCoachCalCostState } from "@/lib/billing/coach-cal-cost-cap";
import { getCoachCalImageCapState } from "@/lib/billing/coach-cal-image-cap";
import { COACH_CAL_IMAGE_UPLOADS_ENABLED } from "@/lib/coach-ai/image-upload";
import type { CoachAiMode, ToolContext } from "@/lib/coach-ai/tools";
import { getCoachCalVersion } from "@/lib/site/coach-cal-version";
import { normalizePlaybookSettings } from "@/domain/playbook/settings";
import {
  backfillHistory,
  completeAssistantTurn,
  failAssistantTurn,
  getOrCreateThread,
  insertRunningAssistantTurn,
  insertUserTurn,
  isThreadEmpty,
} from "@/lib/coach-ai/persistence";
import { createChannel, disposeChannel } from "@/lib/coach-ai/running-turns";

type StreamRequest = {
  history: { role: "user" | "assistant"; text: string; toolCalls?: string[]; playId?: string | null }[];
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
  /**
   * Optional image attached to THIS turn only. Forwarded to Claude in-flight
   * and NEVER persisted — the coach_ai_turns row holds only the text body
   * (plus a "📎 <name>" attachment indicator appended so the coach can see
   * in history which messages had attachments). History replay on
   * subsequent turns will not include the image; Cal sees it once and
   * falls back to its own text description after that.
   */
  userImage?: { mediaType: string; base64: string; name?: string };
};

// Anthropic's vision endpoint supports JPG/PNG/WebP/GIF. Anything else we
// reject up front so the model never sees a malformed source block.
const ALLOWED_IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Cap roughly aligns with Anthropic's 5MB per-image limit; base64 is ~33%
// larger than the underlying binary, so a 5MB binary lands near 6.7MB.
const MAX_IMAGE_BASE64_LENGTH = 7_000_000;

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
  const isEntitled = isAdmin || canUseAiFeatures(entitlement);
  if (!isEntitled) return { ok: false, error: "Coach Cal requires a Team Coach subscription." };
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

  // Site-wide Cal version toggle (admin-controlled, persisted in
  // site_settings). Fetched once per turn. Defaults to "v2" on any DB
  // miss so a transient outage doesn't accidentally revert to v1.
  const calVersion = await getCoachCalVersion();

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
      threadId: null,
      userId: null,
      calVersion,
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
    threadId: null,
    userId: null,
    calVersion,
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

async function recordImageUsage(userId: string): Promise<void> {
  const supabase = await createClient();
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const monthStr = month.toISOString().slice(0, 10);
  await supabase.rpc("increment_coach_ai_image_usage", { p_user_id: userId, p_month: monthStr });
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
  const userImage = body.userImage ?? null;
  if (!text && !userImage) {
    return new Response(
      sseChunk("error", { message: "Empty message." }),
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }
  // Coach Cal photo attachments are disabled (see COACH_CAL_IMAGE_UPLOADS_ENABLED).
  // The client no longer surfaces the attach affordance, but we reject any image
  // payload here at the trust boundary too so a stale/cached client — or a crafted
  // request — can't reach the expensive vision path. The validation + cap logic
  // below stays intact (and dead) so flipping the flag restores the feature whole.
  if (userImage && !COACH_CAL_IMAGE_UPLOADS_ENABLED) {
    return new Response(
      sseChunk("error", { message: "Photo attachments aren't available in Coach Cal right now." }) +
        sseChunk("done", { toolCalls: [], text: "" }),
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }
  if (userImage) {
    if (!ALLOWED_IMAGE_MEDIA_TYPES.has(userImage.mediaType)) {
      return new Response(
        sseChunk("error", { message: "Unsupported image type. Use JPG, PNG, WebP, or GIF." }),
        { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
      );
    }
    if (typeof userImage.base64 !== "string" || userImage.base64.length === 0) {
      return new Response(
        sseChunk("error", { message: "Image payload missing." }),
        { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
      );
    }
    if (userImage.base64.length > MAX_IMAGE_BASE64_LENGTH) {
      return new Response(
        sseChunk("error", { message: "Image too large. Max ~5MB; try a smaller photo." }),
        { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
      );
    }
  }

  // Cost-based Coach Cal cap. Three windows (5h burst / 24h day / calendar
  // month) measured in micro-USD against coach_ai_token_usage — see
  // getCoachCalCostState. This is the only enforcement point; the meter is
  // informational. Admins get enforced=false and blow past every limit.
  // The block payload tells the client which window tripped + when it
  // frees up, so it can render the right CTA (pack for monthly, wait for
  // burst/day) without parsing message text.
  const cost = await getCoachCalCostState(gate.userId, gate.isAdmin);
  if (cost.enforced && cost.exceeded) {
    const w = cost[cost.binding];
    const isMonthly = cost.binding === "month";
    const message = isMonthly
      ? "You've reached this month's Coach Cal limit."
      : "Coach Cal needs a short break — you've sent a lot in a short window.";
    return new Response(
      sseChunk("error", {
        message,
        code: "out_of_budget",
        window: cost.binding,
        resetAt: w.resetAt,
        pack: cost.pack,
      }) +
        sseChunk("done", { toolCalls: [], text: "" }),
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }

  // Separate cap on image uploads — images cost more in vision tokens and
  // the dial moves independently of text turns. Only checked when an image
  // is attached; text-only turns skip this entirely. Site admins bypass
  // the cap (usage is still recorded downstream for analytics).
  if (userImage && !gate.isAdmin) {
    const imageCap = await getCoachCalImageCapState(gate.userId);
    if (imageCap.exceeded) {
      return new Response(
        sseChunk("error", {
          message: `You've used all ${imageCap.limit} image uploads this month. Limit resets on ${imageCap.resetDate}.`,
          code: "out_of_image_uploads",
          count: imageCap.count,
          limit: imageCap.limit,
          resetDate: imageCap.resetDate,
        }) +
          sseChunk("done", { toolCalls: [], text: "" }),
        { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
      );
    }
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

  // Current turn: when an image is attached, build a mixed [image, text]
  // content array per Anthropic's vision shape. Historic turns stay text-only
  // (the image is never replayed because we never persisted it).
  const currentUserContent: ChatMessage["content"] = userImage
    ? [
        {
          type: "image" as const,
          source: { type: "base64" as const, media_type: userImage.mediaType, data: userImage.base64 },
        },
        // Anthropic rejects user messages whose content array has no text at
        // all alongside an image. Substitute a minimal cue when the coach
        // sent the image without typing anything so the model still gets a
        // task framing.
        { type: "text" as const, text: text || "(image attached — read it and walk me through what you see)" },
      ]
    : text;

  const history: ChatMessage[] = [
    ...turnsToHistory(body.history),
    { role: "user", content: currentUserContent },
  ];
  // Per-message play scope, index-aligned with `history`. Each prior turn
  // carries the play it was authored under (undefined for turns persisted
  // before this shipped → treated as "unknown play", never excluded). The
  // current user turn is scoped to the play on screen now (ctx.playId). The
  // harness uses this to keep a ```play fence authored while viewing a DIFFERENT
  // play from becoming this turn's edit/overlay baseline.
  const historyPlayIds: (string | null)[] = [
    ...body.history.map((t) => t.playId ?? null),
    ctx.playId ?? null,
  ];

  // What we persist to coach_ai_turns. The image bytes never touch the DB —
  // a "📎 <name>" suffix stands in so coaches can see in history which
  // messages had attachments. Surfaced 2026-05-21: a coach uploaded a
  // playsheet, scrolled back later, and couldn't tell which messages had
  // attached the image vs which were plain text — leading to confusion
  // when re-asking Cal about a play from earlier. The indicator solves it
  // without persisting the image bytes themselves.
  const imageName = userImage?.name?.trim() || (userImage ? "attached image" : null);
  const imageSuffix = imageName ? `\n\n📎 ${imageName}` : "";
  const persistedUserText = text
    ? `${text}${imageSuffix}`
    : imageName
      ? `📎 ${imageName}`
      : "[image attached]"; // legacy fallback — shouldn't hit since name has a default


  // ── Persist the turn server-side BEFORE kicking off the agent ─────────────
  // This is the change that makes "close the window, come back to the
  // result" work: the assistant turn row exists with status='running' the
  // moment we start, regardless of whether the SSE connection survives.
  const threadPlaybookId =
    requestedMode === "admin_training" ? null : (ctx.playbookId ?? null);
  const threadId = await getOrCreateThread(gate.userId, requestedMode, threadPlaybookId);

  // Wire thread + user into the tool context so thread-scoped tools
  // (Plans subsystem — propose_plan / update_plan_step) can persist
  // rows keyed by these ids. loadToolContext runs before the thread
  // is created, so we patch after the fact rather than threading
  // threadId through the loader.
  (ctx as { threadId: string | null; userId: string | null }).threadId = threadId;
  (ctx as { threadId: string | null; userId: string | null }).userId = gate.userId;

  // First-load migration: when a coach has localStorage history but the
  // server thread is brand-new, persist the prior turns once so the chat
  // doesn't appear to wipe their history. After this insert the server
  // becomes the source of truth for this scope.
  if (await isThreadEmpty(threadId) && body.history.length > 0) {
    try {
      await backfillHistory(threadId, gate.userId, body.history);
    } catch (e) {
      // Backfill failure is non-fatal — the coach loses prior history but
      // the new turn still works. Surface for debugging without aborting.
      console.error("[coach-ai] backfill failed:", e);
    }
  }

  await insertUserTurn(threadId, gate.userId, persistedUserText, ctx.playId ?? null);
  const assistantTurnId = await insertRunningAssistantTurn(
    threadId,
    gate.userId,
    ctx.playId ?? null,
  );

  // ── In-memory pub/sub channel for live SSE ────────────────────────────────
  // The detached agent publishes events to this channel; the SSE response
  // tails it. Two layers of decoupling:
  //   1. Channel lives in this Node process only — DB row is the source of
  //      truth for cross-process / cross-tab reconnect.
  //   2. SSE response unsubscribes on client disconnect, but never closes
  //      the channel or aborts the agent.
  const channel = createChannel(assistantTurnId);

  // ── Detached agent execution ───────────────────────────────────────────────
  // Fire-and-forget. NOT awaited — the SSE response below returns
  // independently. The agent finishes in its own time and writes the
  // result to the DB row regardless of whether anyone is still listening.
  const AGENT_TIMEOUT_MS = 4 * 60 * 1000;
  void (async () => {
    try {
      const result = await Promise.race([
        runAgent(history, ctx, (e: AgentStreamEvent) => {
          if (e.type === "status")     channel.publish({ kind: "event", event: "status",     data: { text: e.text } });
          if (e.type === "tool_call")  channel.publish({ kind: "event", event: "tool_call",  data: { name: e.name } });
          if (e.type === "text_delta") channel.publish({ kind: "event", event: "text_delta", data: { text: e.text } });
        }, { historyPlayIds }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`coach-ai agent timed out after ${AGENT_TIMEOUT_MS / 1000}s`)),
            AGENT_TIMEOUT_MS,
          ),
        ),
      ]);

      // NOTE: save-defense-proposals are NOT persisted to coach_ai_turns yet
      // (no DB column). They flow through the live SSE stream only — if the
      // coach refreshes mid-conversation, the chip is lost (Cal can re-emit
      // by re-proposing). Adding a column is a follow-up migration.
      await completeAssistantTurn(assistantTurnId, {
        text: result.finalText,
        toolCalls: result.toolCalls,
        playbookChips: result.playbookChips,
        noteProposals: result.noteProposals,
        mutated: result.mutated,
      });
      channel.publish({
        kind: "done",
        data: {
          toolCalls: result.toolCalls,
          text: result.finalText,
          playbookChips: result.playbookChips ?? null,
          noteProposals: result.noteProposals ?? null,
          saveDefenseProposals: result.saveDefenseProposals ?? null,
          mutated: result.mutated,
        },
      });
      // Record usage asynchronously — don't block the response
      recordUsage(gate.userId).catch(() => { /* non-critical */ });
      if (userImage) {
        recordImageUsage(gate.userId).catch(() => { /* non-critical */ });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await failAssistantTurn(assistantTurnId, msg).catch(() => {});
      channel.publish({ kind: "error", data: { message: msg } });
      // Always emit a `done` after an error too — this is the
      // belt-and-suspenders companion to the timeout. Even when the
      // agent threw mid-stream (LLM API drop, tool crash), the client
      // needs to leave its "thinking" state.
      channel.publish({
        kind: "done",
        data: {
          toolCalls: [],
          text: "",
          playbookChips: null,
          noteProposals: null,
          saveDefenseProposals: null,
          mutated: false,
        },
      });
    } finally {
      disposeChannel(assistantTurnId);
    }
  })();

  // ── SSE response — pure tail of the channel ───────────────────────────────
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(sseChunk(event, data)));
        } catch {
          // Client disconnected — the channel keeps running, the agent
          // keeps running, the row will still be updated. We just stop
          // forwarding events to a closed pipe.
        }
      };

      // First frame: tell the client which turn id to poll if they reopen.
      send("turn_id", { id: assistantTurnId });

      let unsub: (() => void) | null = null;

      const cleanup = () => {
        if (unsub) { unsub(); unsub = null; }
        try { controller.close(); } catch { /* already closed */ }
      };

      unsub = channel.subscribe((e) => {
        if (e.kind === "event") send(e.event, e.data);
        if (e.kind === "error") send("error", e.data);
        if (e.kind === "done") {
          send("done", e.data);
          cleanup();
        }
      });

      // Client closed the SSE connection → stop forwarding. The agent and
      // the channel keep going; the row will be updated when the agent
      // finishes. The user sees the result on next poll/reload.
      req.signal.addEventListener("abort", cleanup);
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
