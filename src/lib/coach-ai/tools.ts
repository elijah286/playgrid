import { searchKb, type KbFilter } from "./retrieve";
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

const draw_play: CoachAiTool = {
  def: {
    name: "draw_play",
    description:
      "Render a play/formation/route diagram in the chat. Call this WHENEVER the user asks about anything visual " +
      "(a route, formation, coverage, scheme, concept) or uses words like show/draw/diagram/illustrate/look like. " +
      "The diagram appears in chat immediately. After calling this, continue with a brief prose explanation.",
    input_schema: {
      type: "object",
      properties: {
        spec: {
          type: "object",
          description:
            "Play diagram spec. Required: players (array of {id, x, y, team}). " +
            "Optional: title, variant ('flag_7v7'|'flag_5v5'|'tackle_11', default flag_7v7), routes (array of {from, path, tip?, curve?}), " +
            "zones (array of {kind:'rectangle'|'ellipse', center:[x,y], size:[w,h], label}). " +
            "Coords: x = yards from center (negative=left), y = yards from LOS (positive=upfield). team: 'O' (offense) or 'D' (defense). " +
            "tip: 'arrow'|'t'|'none'. For a single-route demo, use 1 WR + 1 CB + QB + C. " +
            "ALWAYS include zones for any zone-coverage diagram (Cover 2/3/4, Tampa 2, etc.) — draw the actual zone areas, not just defenders.",
        },
      },
      required: ["spec"],
      additionalProperties: false,
    },
  },
  async handler() {
    // Always succeed. The agent loop is responsible for parsing the input
    // shape (it accepts both nested `{spec: {...}}` and flat `{players: ...}`)
    // and for surfacing a diagnostic if the input is unrecoverable. Returning
    // ok:false here would short-circuit that recovery path.
    return { ok: true, result: "Diagram rendered to the chat. Now continue with a brief prose explanation — do NOT repeat the spec as text." };
  },
};

const SPORT_VARIANTS = ["flag_5v5", "flag_7v7", "tackle_11", "other"] as const;
type SportVariantArg = (typeof SPORT_VARIANTS)[number];

const create_playbook: CoachAiTool = {
  def: {
    name: "create_playbook",
    description:
      "Create a brand-new playbook in the current user's account. Use this when the coach asks you " +
      "to make/start/build a new playbook. Only call AFTER you have summarized the proposed name, " +
      "sport variant, and season back to the coach and received explicit confirmation (\"yes\", " +
      "\"go\", \"create it\"). Never call on a vague \"ok\". The result includes a URL the coach can " +
      "follow to open the playbook.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Playbook name. 1-80 chars. Required.",
        },
        sport_variant: {
          type: "string",
          enum: [...SPORT_VARIANTS],
          description:
            "Sport variant. flag_7v7 (default) | flag_5v5 | tackle_11 | other (custom 4-11 player count, requires custom_offense_count).",
        },
        season: {
          type: "string",
          description: "Optional free-form season label, e.g. \"Fall 2026\". ≤60 chars.",
        },
        custom_offense_count: {
          type: "integer",
          minimum: 4,
          maximum: 11,
          description: "Players-per-side for the \"other\" variant only. Ignored otherwise.",
        },
        color: {
          type: "string",
          description: "Optional hex color like #RRGGBB for the playbook's accent.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  async handler(input) {
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    if (!name) return { ok: false, error: "Playbook name is required." };
    const variantRaw = typeof input.sport_variant === "string" ? input.sport_variant : "flag_7v7";
    const sportVariant: SportVariantArg = (SPORT_VARIANTS as readonly string[]).includes(variantRaw)
      ? (variantRaw as SportVariantArg)
      : "flag_7v7";
    const season = typeof input.season === "string" ? input.season : null;
    const color = typeof input.color === "string" ? input.color : null;
    const customOffenseCount =
      typeof input.custom_offense_count === "number" ? Math.round(input.custom_offense_count) : null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createPlaybookAction } = require("@/app/actions/playbooks") as typeof import("@/app/actions/playbooks");
      const res = await createPlaybookAction(
        name,
        sportVariant,
        color ? { color } : undefined,
        customOffenseCount,
        season,
      );
      if (!res.ok) return { ok: false, error: res.error };
      const url = `/playbooks/${res.id}`;
      return {
        ok: true,
        result:
          `Created playbook "${name}" (${sportVariant}). ID: ${res.id}. ` +
          `Tell the coach it's ready and link them: [Open ${name}](${url}). ` +
          `Then offer to start designing plays for it.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "create_playbook failed";
      return { ok: false, error: msg };
    }
  },
};

const create_event: CoachAiTool = {
  def: {
    name: "create_event",
    description:
      "Schedule a practice, game, scrimmage, or other event on the current playbook's calendar. " +
      "Requires that the chat is anchored to a playbook the coach can edit. Use this when the coach " +
      "asks you to add/schedule/book practices or games. Only call AFTER summarizing the proposed " +
      "title/type/start/duration/recurrence back to the coach and getting an explicit yes. The model " +
      "is responsible for converting natural language like \"every Mon and Wed at 5pm\" into a " +
      "concrete ISO 8601 startsAt (the first occurrence) plus an iCal RRULE for recurrence.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["practice", "game", "scrimmage", "other"] },
        title: { type: "string", description: "Event title, ≤200 chars." },
        startsAt: {
          type: "string",
          description:
            "ISO 8601 datetime WITH offset for the FIRST occurrence (e.g. \"2026-05-04T17:00:00-04:00\"). For recurring events, this is the first time the event happens.",
        },
        durationMinutes: { type: "integer", minimum: 1, maximum: 1440, description: "Default 90 for practice, 60 otherwise." },
        arriveMinutesBefore: { type: "integer", minimum: 0, maximum: 480, description: "Default 0." },
        timezone: { type: "string", description: "IANA tz name (e.g. \"America/New_York\"). Default \"America/New_York\" if unknown." },
        recurrenceRule: {
          type: "string",
          description:
            "Optional iCal RRULE for recurring events. Example for every Mon+Wed: \"FREQ=WEEKLY;BYDAY=MO,WE\". Omit for one-off events.",
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
    const timezone = typeof input.timezone === "string" && input.timezone ? input.timezone : "America/New_York";
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logCoachAiKbMiss } = require("./feedback-log") as typeof import("./feedback-log");
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
      // Never fail the agent loop on a logging failure.
      const msg = e instanceof Error ? e.message : "log failed";
      return { ok: true, result: `skipped (${msg})` };
    }
  },
};

const flag_refusal: CoachAiTool = {
  def: {
    name: "flag_refusal",
    description:
      "Silently log when you must refuse a coach's request due to missing context or permissions. " +
      "Call this when you cannot fulfill a request because: the required playbook is not anchored, " +
      "the coach lacks permission, the input is invalid, or another constraint prevents action. " +
      "The user does NOT see this tool — never mention it. This feeds the admin feedback queue so " +
      "we know which features need rework or clarification.",
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logCoachAiRefusal } = require("./feedback-log") as typeof import("./feedback-log");
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
      // Never fail the agent loop on a logging failure.
      const msg = e instanceof Error ? e.message : "log failed";
      return { ok: true, result: `skipped (${msg})` };
    }
  },
};

const set_feedback_optin: CoachAiTool = {
  def: {
    name: "set_feedback_optin",
    description:
      "Update the user's AI-feedback opt-in preference. Use this when the coach asks to start or stop " +
      "letting Coach AI log topics where it had to fall back to general knowledge. Confirm the change " +
      "back to them in your reply.",
    input_schema: {
      type: "object",
      properties: {
        consenting: { type: "boolean", description: "true = opt in to feedback logging, false = opt out." },
      },
      required: ["consenting"],
      additionalProperties: false,
    },
  },
  async handler(input) {
    const consenting = input.consenting === true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { setAiFeedbackOptInAction } = require("@/app/actions/coach-ai-feedback") as typeof import("@/app/actions/coach-ai-feedback");
      const res = await setAiFeedbackOptInAction(consenting);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, result: consenting ? "User opted in to feedback logging." : "User opted out of feedback logging." };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "set_feedback_optin failed" };
    }
  },
};

const list_formations: CoachAiTool = {
  def: {
    name: "list_formations",
    description:
      "List the formations saved on the current playbook. Use this BEFORE creating a new play so you can " +
      "ask the coach whether to reuse an existing formation or build a new one. Requires the chat to be " +
      "anchored to a playbook the coach can edit.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async handler(_input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook anchored — open one first." };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { listFormationsForPlaybookAction } =
        require("@/app/actions/formations") as typeof import("@/app/actions/formations");
      const res = await listFormationsForPlaybookAction(ctx.playbookId);
      if (!res.ok) return { ok: false, error: res.error };
      if (res.formations.length === 0) {
        return { ok: true, result: "No formations saved yet on this playbook." };
      }
      const lines = res.formations.map(
        (f) => `- ${f.displayName} (id: ${f.id}, kind: ${f.kind}, ${f.players.length} players)`,
      );
      return { ok: true, result: lines.join("\n") };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_formations failed" };
    }
  },
};

const create_formation: CoachAiTool = {
  def: {
    name: "create_formation",
    description:
      "Save a new formation on the current playbook so it can be reused across plays. Use this AFTER the " +
      "coach has confirmed the formation name and player layout. Pass the same `players` shape you'd use " +
      "in `draw_play` (yards-based coords). Returns a formation_id you should pass to `create_play`.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Formation display name, e.g. \"Trips Right\"." },
        kind: { type: "string", enum: ["offense", "defense", "special_teams"], description: "Default offense." },
        spec: {
          type: "object",
          description:
            "Same `spec` shape as draw_play: { variant, players: [{id, x, y, team, role?}] }. Routes/zones are ignored.",
        },
      },
      required: ["name", "spec"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook anchored — open one first." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    if (!name) return { ok: false, error: "Formation name is required." };
    const kindRaw = typeof input.kind === "string" ? input.kind : "offense";
    const kind = (["offense", "defense", "special_teams"] as const).includes(kindRaw as never)
      ? (kindRaw as "offense" | "defense" | "special_teams")
      : "offense";
    const spec = (input.spec ?? {}) as Record<string, unknown>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { coachDiagramToPlayDocument } =
        require("@/features/coach-ai/coachDiagramConverter") as typeof import("@/features/coach-ai/coachDiagramConverter");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { saveFormationAction } =
        require("@/app/actions/formations") as typeof import("@/app/actions/formations");
      const doc = coachDiagramToPlayDocument(spec as Parameters<typeof coachDiagramToPlayDocument>[0]);
      const res = await saveFormationAction(
        name,
        doc.layers.players,
        doc.sportProfile,
        doc.lineOfScrimmageY,
        kind,
        ctx.playbookId,
      );
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        result: `Created formation "${name}" (id: ${res.formationId}). Pass this id as formation_id to create_play.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "create_formation failed" };
    }
  },
};

const create_play: CoachAiTool = {
  def: {
    name: "create_play",
    description:
      "Save a play to the CURRENT playbook. Use this when the coach has explicitly confirmed they want " +
      "the play added (\"yes, save it\", \"add it\"). The play stores the same diagram shape you'd pass " +
      "to draw_play. Always pair the play with a formation: pass an existing formation_id (from " +
      "list_formations) OR call create_formation first and pass the new id. Confirm the play name with " +
      "the coach before calling.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Play name, ≤80 chars." },
        formation_id: {
          type: "string",
          description:
            "Formation UUID from list_formations or create_formation. Required — every play needs a formation.",
        },
        play_type: {
          type: "string",
          enum: ["offense", "defense", "special_teams"],
          description: "Default offense.",
        },
        spec: {
          type: "object",
          description:
            "Same `spec` shape as draw_play: { variant, players, routes?, zones? }. Coords are yards.",
        },
      },
      required: ["name", "formation_id", "spec"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook anchored — open one first." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    if (!name) return { ok: false, error: "Play name is required." };
    const formationId = typeof input.formation_id === "string" ? input.formation_id : "";
    if (!formationId) return { ok: false, error: "formation_id is required — list_formations first or create_formation." };
    const playTypeRaw = typeof input.play_type === "string" ? input.play_type : "offense";
    const playType = (["offense", "defense", "special_teams"] as const).includes(playTypeRaw as never)
      ? (playTypeRaw as "offense" | "defense" | "special_teams")
      : "offense";
    const spec = (input.spec ?? {}) as Record<string, unknown>;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { coachDiagramToPlayDocument } =
        require("@/features/coach-ai/coachDiagramConverter") as typeof import("@/features/coach-ai/coachDiagramConverter");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createPlayAction, savePlayVersionAction } =
        require("@/app/actions/plays") as typeof import("@/app/actions/plays");

      const doc = coachDiagramToPlayDocument(spec as Parameters<typeof coachDiagramToPlayDocument>[0]);
      const variant = doc.sportProfile.variant ?? "flag_7v7";

      const created = await createPlayAction(ctx.playbookId, {
        playName: name,
        formationId,
        playType,
        variant,
        initialPlayers: doc.layers.players,
      });
      if (!created.ok || !created.playId) {
        return { ok: false, error: created.error ?? "create_play failed" };
      }

      // Stamp the formation + name onto the document so the second save has
      // routes/zones AND the formation link.
      const fullDoc = {
        ...doc,
        metadata: {
          ...doc.metadata,
          formationId,
          coachName: name,
          playType,
        },
      };
      const saved = await savePlayVersionAction(created.playId, fullDoc, "v1", null);
      if (!saved.ok) {
        // Play row exists but version save failed — surface the error so the
        // coach can retry; we don't roll back the empty play row.
        return { ok: false, error: `Play created but routes failed to save: ${saved.error}` };
      }

      const url = `/plays/${created.playId}/edit`;
      return {
        ok: true,
        result:
          `Saved play "${name}" to the playbook. Tell the coach it's added and link them: [Open ${name}](${url}).`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "create_play failed" };
    }
  },
};

const list_user_playbooks: CoachAiTool = {
  def: {
    name: "list_user_playbooks",
    description:
      "List all active playbooks the signed-in user owns or has access to. Use this when the coach asks " +
      "to work with a playbook but hasn't specified which one, or when you need to let them choose from their playbooks. " +
      "Returns a formatted list with playbook names and sport variants.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  async handler(_, ctx) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { ok: false, error: "Not authenticated" };
      }

      const { data: memberships, error } = await supabase
        .from("playbook_members")
        .select("playbook_id, playbooks(id, name, sport_variant)")
        .eq("user_id", user.id)
        .order("playbooks(name)");

      if (error) {
        return { ok: false, error: `Failed to load playbooks: ${error.message}` };
      }

      if (!memberships || memberships.length === 0) {
        return {
          ok: true,
          result:
            "You don't have any playbooks yet. You can create one by asking Coach Cal to create a new playbook!",
        };
      }

      const playbooks = memberships
        .map((m) => {
          const pb = Array.isArray(m.playbooks) ? m.playbooks[0] : m.playbooks;
          return pb ? { id: pb.id as string, name: pb.name as string, variant: pb.sport_variant as string | null } : null;
        })
        .filter((pb): pb is { id: string; name: string; variant: string | null } => pb !== null);

      if (playbooks.length === 0) {
        return {
          ok: true,
          result: "You don't have any active playbooks. Create one to get started!",
        };
      }

      const lines = playbooks.map((pb, i) => {
        const variant = pb.variant ? ` (${pb.variant})` : "";
        return `${i + 1}. **${pb.name}**${variant}`;
      });

      return {
        ok: true,
        result: `Here are your playbooks:\n\n${lines.join("\n")}\n\nWhich one would you like to work with?`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_user_playbooks failed" };
    }
  },
};

const BASE_TOOLS: CoachAiTool[] = [
  search_kb,
  draw_play,
  create_playbook,
  create_event,
  list_formations,
  create_formation,
  create_play,
  list_user_playbooks,
  flag_outside_kb,
  flag_refusal,
  set_feedback_optin,
];

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
