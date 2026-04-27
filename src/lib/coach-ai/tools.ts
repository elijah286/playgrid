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
            "Optional: title, variant ('flag_7v7'|'flag_5v5'|'tackle_11', default flag_7v7), routes (array of {from, path, tip?, curve?}). " +
            "Coords: x = yards from center (negative=left), y = yards from LOS (positive=upfield). team: 'O' (offense) or 'D' (defense). " +
            "tip: 'arrow'|'t'|'none'. For a single-route demo, use 1 WR + 1 CB + QB + C.",
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

const BASE_TOOLS: CoachAiTool[] = [search_kb, draw_play, create_playbook];

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
