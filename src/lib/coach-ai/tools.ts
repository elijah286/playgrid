import { searchKb, type KbFilter } from "./retrieve";
import { createClient } from "@/lib/supabase/server";
import { logCoachAiRefusal, logCoachAiKbMiss } from "./feedback-log";
import type { ToolDef } from "./llm";

export type CoachAiMode = "normal" | "admin_training" | "playbook_training";

export type ToolContext = {
  /** Current playbook id, when chat is anchored to one. */
  playbookId: string | null;
  /** Sport metadata of the current playbook (used to bias retrieval). */
  sportVariant: string | null;
  gameLevel: string | null;
  sanctioningBody: string | null;
  ageDivision: string | null;
  /** True when caller is a site admin. Required for global KB write tools. */
  isAdmin: boolean;
  /** True when caller can edit the current playbook. Required for playbook KB write tools. */
  canEditPlaybook: boolean;
  /** Active mode — gates which tools are exposed to the LLM. */
  mode: CoachAiMode;
};

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<{ ok: true; result: string } | { ok: false; error: string }>;

export type CoachAiTool = {
  def: ToolDef;
  handler: ToolHandler;
};

const search_kb: CoachAiTool = {
  def: {
    name: "search_kb",
    description:
      "Search the Coach AI knowledge base (rules, schemes, terminology, tactics). " +
      "Use this whenever the user asks about a rule, formation, play concept, or you " +
      "need to ground an answer in source material rather than guessing.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for. Phrase as a topic, not a question.",
        },
        scope: {
          type: "string",
          enum: ["global", "playbook", "any"],
          description:
            "Restrict to global rules/scheme docs, the current playbook's notes, or both. Default: any.",
        },
        match_count: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Max documents to return. Default 6.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const query = typeof input.query === "string" ? input.query : "";
    const scopeArg = typeof input.scope === "string" ? input.scope : "any";
    const matchCount =
      typeof input.match_count === "number" ? Math.min(20, Math.max(1, Math.floor(input.match_count))) : 6;

    const filter: KbFilter = {
      scope: scopeArg === "any" ? null : (scopeArg as "global" | "playbook"),
      playbookId: ctx.playbookId,
      sportVariant: ctx.sportVariant,
      gameLevel: ctx.gameLevel,
      sanctioningBody: ctx.sanctioningBody,
      ageDivision: ctx.ageDivision,
      matchCount,
    };

    try {
      const matches = await searchKb(query, filter);
      if (matches.length === 0) {
        return { ok: true, result: "No matching documents." };
      }
      const lines = matches.map((m, i) => {
        const meta = [m.scope, m.topic, m.subtopic, m.sport_variant, m.sanctioning_body]
          .filter(Boolean)
          .join(" / ");
        const flags = [
          m.authoritative ? "authoritative" : null,
          m.needs_review ? "needs_review" : null,
        ]
          .filter(Boolean)
          .join(", ");
        const flagStr = flags ? ` [${flags}]` : "";
        return `[${i + 1}] (${m.similarity.toFixed(3)}) ${m.title} — ${meta}${flagStr}\n${m.content}`;
      });
      return { ok: true, result: lines.join("\n\n---\n\n") };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "search failed";
      return { ok: false, error: msg };
    }
  },
};

const list_my_playbooks: CoachAiTool = {
  def: {
    name: "list_my_playbooks",
    description:
      "List the playbooks the signed-in coach owns or belongs to. " +
      "Call this whenever the coach needs to pick a team (e.g. for scheduling, " +
      "play edits, or any other playbook-specific action) and hasn't opened one yet. " +
      "Return the results as clickable links so the coach can navigate directly.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  async handler(_input, _ctx) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const { data, error } = await supabase
        .from("playbook_members")
        .select("role, playbooks!inner(id, name, season, sport_variant, color, is_archived, is_default, is_example)")
        .eq("user_id", user.id)
        .order("role", { ascending: true });

      if (error) return { ok: false, error: error.message };

      type PbRow = {
        id: string; name: string; season: string | null; sport_variant: string | null;
        color: string | null; is_archived: boolean; is_default: boolean; is_example: boolean;
      };
      type Row = { role: string; playbooks: PbRow | PbRow[] };

      const chips = (data as Row[] ?? [])
        .map((r) => ({ role: r.role, pb: Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks }))
        .filter(({ pb }) => pb && !pb.is_archived && !pb.is_default && !pb.is_example)
        .map(({ pb }) => ({
          id: pb.id,
          name: pb.name,
          color: pb.color ?? null,
          season: pb.season ?? null,
          variant: pb.sport_variant ?? null,
        }));

      if (chips.length === 0) return { ok: true, result: "No active playbooks found." };

      return {
        ok: true,
        result:
          "Pick a team:\n\n" +
          "```playbooks\n" +
          JSON.stringify(chips) +
          "\n```",
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_my_playbooks failed" };
    }
  },
};

const flag_outside_kb: CoachAiTool = {
  def: {
    name: "flag_outside_kb",
    description:
      "Silently log when you had to answer from general football knowledge instead of the seeded knowledge base. " +
      "Call this BEFORE composing your reply, every time the user's question wasn't well-covered by search_kb hits " +
      "(no matches, weak matches, or matches that don't actually answer the question). The user does NOT see this " +
      "tool — never mention to them that the KB was missing the answer. This feeds the admin AI Feedback queue so " +
      "we know which topics to seed next.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Short topic label, e.g. \"Tampa 2 defense\", \"trips bunch\"." },
        user_question: { type: "string", description: "The coach's question, verbatim or close to it." },
        reason: {
          type: "string",
          enum: ["no_results", "weak_results", "irrelevant_results", "concept_not_seeded"],
          description: "Why you fell back to general knowledge.",
        },
      },
      required: ["topic", "user_question", "reason"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const topic = typeof input.topic === "string" ? input.topic.trim().slice(0, 200) : "";
    const userQuestion = typeof input.user_question === "string" ? input.user_question.trim().slice(0, 2000) : "";
    const reason = typeof input.reason === "string" ? input.reason : "no_results";
    if (!topic || !userQuestion) return { ok: true, result: "skipped (empty)" };
    try {
      await logCoachAiKbMiss({
        topic,
        userQuestion,
        reason,
        playbookId: ctx.playbookId,
        sportVariant: ctx.sportVariant,
        sanctioningBody: ctx.sanctioningBody,
        gameLevel: ctx.gameLevel,
        ageDivision: ctx.ageDivision,
      });
      return { ok: true, result: "logged" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "log failed";
      return { ok: true, result: `skipped (${msg})` };
    }
  },
};

const flag_refusal: CoachAiTool = {
  def: {
    name: "flag_refusal",
    description:
      "Silently log when you must refuse a coach's request. Call this BEFORE your refusal message any time you " +
      "cannot fulfill what the coach asked for: missing playbook context, permission denied, invalid input, " +
      "feature unavailable, OR when the request is outside your scope (entertainment, trivia, general non-football). " +
      "The user does NOT see this tool — never mention it. This feeds the admin feedback queue so we know which " +
      "features need rework or what users keep asking about.",
    input_schema: {
      type: "object",
      properties: {
        user_request: { type: "string", description: "What the coach asked for, verbatim or close." },
        refusal_reason: {
          type: "string",
          enum: [
            "playbook_required",
            "permission_denied",
            "invalid_input",
            "feature_unavailable",
            "tooling_error",
            "out_of_scope",
          ],
          description: "Why the request cannot be fulfilled.",
        },
      },
      required: ["user_request", "refusal_reason"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const userRequest = typeof input.user_request === "string" ? input.user_request.trim().slice(0, 2000) : "";
    const refusalReason = typeof input.refusal_reason === "string" ? input.refusal_reason : "tooling_error";
    if (!userRequest) return { ok: true, result: "skipped (empty)" };
    try {
      await logCoachAiRefusal({
        userRequest,
        refusalReason,
        playbookId: ctx.playbookId,
        sportVariant: ctx.sportVariant,
        sanctioningBody: ctx.sanctioningBody,
        gameLevel: ctx.gameLevel,
        ageDivision: ctx.ageDivision,
      });
      return { ok: true, result: "logged" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "log failed";
      return { ok: true, result: `skipped (${msg})` };
    }
  },
};

const create_event: CoachAiTool = {
  def: {
    name: "create_event",
    description:
      "Schedule a practice, game, scrimmage, or other event on the current playbook's calendar. " +
      "Requires that the chat is anchored to a playbook the coach can edit. Use this when the coach " +
      "asks to add/schedule/book practices or games. Only call AFTER summarizing the proposed " +
      "title/type/start/duration/recurrence back to the coach and getting an explicit yes. " +
      "Convert natural language like \"every Mon and Wed at 5pm\" into a concrete ISO 8601 startsAt " +
      "(the first occurrence) plus an iCal RRULE for recurrence.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["practice", "game", "scrimmage", "other"] },
        title: { type: "string", description: "Event title, ≤200 chars." },
        startsAt: {
          type: "string",
          description:
            "ISO 8601 datetime WITH offset for the FIRST occurrence (e.g. \"2026-05-04T17:00:00-05:00\"). For recurring events, this is the first time the event happens.",
        },
        durationMinutes: { type: "integer", minimum: 1, maximum: 1440, description: "Default 90 for practice, 60 otherwise." },
        arriveMinutesBefore: { type: "integer", minimum: 0, maximum: 480, description: "Default 0." },
        timezone: { type: "string", description: "IANA tz name (e.g. \"America/Chicago\"). Default \"America/Chicago\" if unknown." },
        recurrenceRule: {
          type: "string",
          description:
            "Optional iCal RRULE for recurring events. Example for every Mon+Wed: \"FREQ=WEEKLY;BYDAY=MO,WE\". Add UNTIL=YYYYMMDDTHHMMSSZ to end the series. Omit for one-off events.",
        },
        location: {
          type: "object",
          properties: {
            name: { type: "string" },
            address: { type: "string" },
          },
          required: ["name"],
          additionalProperties: false,
        },
        notes: { type: "string", description: "Optional free-form notes for the event." },
        opponent: { type: "string", description: "Game-only: opponent name." },
        homeAway: { type: "string", enum: ["home", "away", "neutral"], description: "Game-only." },
        reminderOffsetsMinutes: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 20160 },
          maxItems: 8,
          description: "Reminders, minutes before start. Default [60] (one hour before).",
        },
      },
      required: ["type", "title", "startsAt", "timezone"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) {
      return { ok: false, error: "Scheduling needs a playbook — open one from the sidebar first." };
    }
    if (!ctx.canEditPlaybook) {
      return { ok: false, error: "Only coaches who can edit this playbook can schedule events." };
    }
    const type = input.type as string;
    const title = typeof input.title === "string" ? input.title : "";
    if (!title) return { ok: false, error: "Title is required." };
    const startsAt = typeof input.startsAt === "string" ? input.startsAt : "";
    if (!startsAt) return { ok: false, error: "startsAt is required (ISO 8601)." };
    const timezone = typeof input.timezone === "string" && input.timezone ? input.timezone : "America/Chicago";
    const durationMinutes = typeof input.durationMinutes === "number"
      ? Math.round(input.durationMinutes)
      : type === "practice" ? 90 : 60;
    const arriveMinutesBefore = typeof input.arriveMinutesBefore === "number"
      ? Math.round(input.arriveMinutesBefore)
      : 0;
    const recurrenceRule = typeof input.recurrenceRule === "string" && input.recurrenceRule ? input.recurrenceRule : null;
    const notes = typeof input.notes === "string" ? input.notes : null;
    const opponent = typeof input.opponent === "string" ? input.opponent : null;
    const homeAway = typeof input.homeAway === "string" ? input.homeAway : null;
    const reminderOffsetsMinutes = Array.isArray(input.reminderOffsetsMinutes)
      ? (input.reminderOffsetsMinutes as unknown[]).filter((n): n is number => typeof n === "number").map(Math.round)
      : [60];
    const rawLocation = input.location as { name?: unknown; address?: unknown } | undefined | null;
    const location = rawLocation && typeof rawLocation.name === "string"
      ? {
          name: rawLocation.name,
          address: typeof rawLocation.address === "string" ? rawLocation.address : null,
          lat: null,
          lng: null,
        }
      : null;

    const payload = {
      type,
      title,
      startsAt,
      durationMinutes,
      arriveMinutesBefore,
      timezone,
      location,
      notes,
      opponent,
      homeAway,
      recurrenceRule,
      reminderOffsetsMinutes,
    };

    try {
      // Lazy import: server action must not be eagerly required at module init.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createEventAction } = require("@/app/actions/calendar") as typeof import("@/app/actions/calendar");
      const res = await createEventAction(ctx.playbookId, payload);
      if (!res.ok) return { ok: false, error: res.error };
      const url = `/playbooks/${ctx.playbookId}?tab=calendar`;
      const recurNote = recurrenceRule ? ` (recurring: ${recurrenceRule})` : "";
      return {
        ok: true,
        result:
          `Scheduled "${title}" on ${startsAt}${recurNote}. Tell the coach it's saved and link them to the calendar: [Open calendar](${url}).`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "create_event failed";
      return { ok: false, error: msg };
    }
  },
};

const BASE_TOOLS: CoachAiTool[] = [search_kb, list_my_playbooks, flag_outside_kb, flag_refusal];

/** Tools exposed for a given mode/auth combo. */
export function toolsFor(ctx: ToolContext): CoachAiTool[] {
  const tools: CoachAiTool[] = [...BASE_TOOLS];
  if (ctx.mode === "admin_training" && ctx.isAdmin) {
    // Lazy import to avoid cycle at module init.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KB_ADMIN_TOOLS } = require("./kb-tools") as typeof import("./kb-tools");
    tools.push(...KB_ADMIN_TOOLS);
  }
  if (ctx.mode === "playbook_training" && ctx.canEditPlaybook && ctx.playbookId) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PLAYBOOK_KB_TOOLS } = require("./playbook-tools") as typeof import("./playbook-tools");
    tools.push(...PLAYBOOK_KB_TOOLS);
  }
  if (ctx.playbookId) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PLAY_TOOLS } = require("./play-tools") as typeof import("./play-tools");
    const readTools = PLAY_TOOLS.filter((t) => t.def.name !== "update_play");
    tools.push(...readTools);
    if (ctx.canEditPlaybook) {
      const writeTools = PLAY_TOOLS.filter((t) => t.def.name === "update_play");
      tools.push(...writeTools);
      // Scheduling: only available to coaches who can edit the playbook.
      tools.push(create_event);
    }
  }
  return tools;
}

export function toolDefs(ctx: ToolContext): ToolDef[] {
  return toolsFor(ctx).map((t) => t.def);
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const tool = toolsFor(ctx).find((t) => t.def.name === name);
  if (!tool) return { ok: false, error: `Unknown or unavailable tool: ${name}` };
  return tool.handler(input, ctx);
}
