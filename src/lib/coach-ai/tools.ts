import { searchKb, type KbFilter } from "./retrieve";
import { createClient } from "@/lib/supabase/server";
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

const BASE_TOOLS: CoachAiTool[] = [search_kb, list_my_playbooks];

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
