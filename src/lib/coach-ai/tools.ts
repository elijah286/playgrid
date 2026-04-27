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

const BASE_TOOLS: CoachAiTool[] = [search_kb, draw_play];

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
