import { searchKb, type KbFilter } from "./retrieve";
import { createClient } from "@/lib/supabase/server";
import { logCoachAiRefusal, logCoachAiKbMiss } from "./feedback-log";
import type { ToolDef } from "./llm";
import type { PlaybookSettings } from "@/domain/playbook/settings";
// Top-level imports for surgical-modify tools (modify_play_route,
// add_defense_to_play, computeDefenseAlignment helper). Other tools
// in this file use require() for lazy-loading; the surgical-modify
// path is hot enough that eager-loading these is fine, and the import
// form resolves cleanly under vitest's @/ alias (require's don't).
import {
  findDefensiveAlignment,
  listDefensiveAlignments,
  alignmentForStrength,
  alignmentWithAssignments,
  zonesForStrength,
  type DefenderAssignmentSpec,
} from "@/domain/play/defensiveAlignments";
import { synthesizeAlignment } from "@/domain/play/defensiveSynthesize";
import { applyRouteMods, type RouteMod } from "./play-mutations";
import { sanitizeCoachDiagram } from "@/domain/play/sanitize";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";

export type CoachAiMode = "normal" | "admin_training";

export type ToolContext = {
  /** Current playbook id, when chat is anchored to one. */
  playbookId: string | null;
  /** Display name of the current playbook (so Cal can refer to it by name). */
  playbookName: string | null;
  /** Sport metadata of the current playbook (used to bias retrieval). */
  sportVariant: string | null;
  gameLevel: string | null;
  sanctioningBody: string | null;
  ageDivision: string | null;
  /** Per-playbook game-rule settings (blockingAllowed, centerIsEligible,
   *  handoffsAllowed, rushingAllowed, etc.). Null when no playbook is
   *  anchored. The system prompt surfaces these so Cal won't suggest
   *  illegal actions; the chat-time validators reject them anyway. */
  playbookSettings: PlaybookSettings | null;
  /** True when caller is a site admin. Required for global KB write tools. */
  isAdmin: boolean;
  /** True when caller can edit the current playbook. Required for playbook KB write tools. */
  canEditPlaybook: boolean;
  /** Active mode — gates which tools are exposed to the LLM. */
  mode: CoachAiMode;
  /** Caller's IANA timezone (from the browser). Used so "today" / weekday tables
   *  in the system prompt match the coach's local clock instead of the server's UTC. */
  timezone: string | null;
  /** Current play id, when chat is opened from inside the play editor. */
  playId: string | null;
  /** Display name of the current play (e.g. "Trips Left 03"). */
  playName: string | null;
  /** Formation label of the current play (e.g. "Trips Left"). */
  playFormation: string | null;
  /** Pre-fetched CoachDiagram JSON for the anchored play, if any. Injected into the
   *  system prompt so Cal answers questions about the visible play without having
   *  to call get_play (and without inventing a generic example diagram). */
  playDiagramText: string | null;
};

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<{ ok: true; result: string } | { ok: false; error: string }>;

export type CoachAiTool = {
  def: ToolDef;
  handler: ToolHandler;
};

// ── Shared helper: compute defensive alignment ─────────────────────────────
// Used by both place_defense and add_defense_to_play. Returns the catalog
// (or synthesized) alignment data plus a flag indicating whether the result
// came from the catalog or the synthesizer fallback. Encapsulating the
// catalog-OR-synthesize-OR-error logic in one place keeps the two tools'
// behavior consistent — fixing a defensive-alignment bug now fixes both
// tools by construction.

type DefenseAlignmentZone = {
  kind: "rectangle" | "ellipse";
  center: [number, number];
  size: [number, number];
  label: string;
  /** Bare defender label that owns this zone (e.g. "FS", "WL", "CB").
   *  Used downstream to tint the zone to match the owning defender's
   *  triangle color. */
  ownerLabel?: string;
};

type DefensePlayerWithAssignment = {
  id: string;
  x: number;
  y: number;
  /**
   * Per-defender assignment from the catalog. Always set for catalog
   * matches (D1); synthesized alignments fall back to a coverage-wide
   * default since the synthesizer doesn't know per-defender intent.
   */
  assignment?: DefenderAssignmentSpec;
};

type DefenseAlignmentResult =
  | {
      ok: true;
      front: string;
      coverage: string;
      variant: string;
      description: string;
      players: DefensePlayerWithAssignment[];
      zones: DefenseAlignmentZone[];
      manCoverage: boolean;
      synthesized: boolean;
    }
  | { ok: false; error: string };

function computeDefenseAlignment(
  variant: string,
  front: string,
  coverage: string,
  strength: "left" | "right",
): DefenseAlignmentResult {
  const catalogMatch = findDefensiveAlignment(variant, front, coverage);
  if (catalogMatch) {
    return {
      ok: true,
      front: catalogMatch.front,
      coverage: catalogMatch.coverage,
      variant: catalogMatch.variant,
      description: catalogMatch.description,
      players: alignmentWithAssignments(catalogMatch, strength).map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        assignment: p.assignment,
      })),
      zones: (() => {
        // Pair each zone with the FIRST defender that drops into it so
        // the chat fence can tint zones to match their triangle.
        const owners = new Map<string, string>();
        for (const p of alignmentWithAssignments(catalogMatch, strength)) {
          if (p.assignment.kind === "zone" && !owners.has(p.assignment.zoneId)) {
            owners.set(p.assignment.zoneId, p.id);
          }
        }
        return zonesForStrength(catalogMatch, strength).map((z) => ({
          kind: z.kind,
          center: [z.center[0], z.center[1]] as [number, number],
          size: [z.size[0], z.size[1]] as [number, number],
          label: z.label,
          ...(z.id && owners.get(z.id) ? { ownerLabel: owners.get(z.id) } : {}),
        }));
      })(),
      manCoverage: catalogMatch.manCoverage === true,
      synthesized: false,
    };
  }
  const synth = synthesizeAlignment(variant, front, coverage);
  if (synth) {
    const flip = strength === "left";
    return {
      ok: true,
      front: synth.front,
      coverage: synth.coverage,
      variant: synth.variant,
      description: synth.description,
      players: synth.players.map((p) => ({ id: p.id, x: flip ? -p.x : p.x, y: p.y })),
      zones: synth.zones.map((z) => ({
        kind: z.kind,
        center: [flip ? -z.center.x : z.center.x, z.center.y] as [number, number],
        size: [z.size.x, z.size.y] as [number, number],
        label: z.label,
      })),
      manCoverage: synth.manCoverage,
      synthesized: true,
    };
  }
  const available = listDefensiveAlignments(variant);
  if (available.length === 0) {
    return {
      ok: false,
      error:
        `No canonical alignments seeded for variant "${variant}", and the front "${front}" couldn't be parsed as an N-M pattern (e.g., "6-2", "5-3 Stack"). ` +
        `Place defense by hand using the prompt's defender placement rules.`,
    };
  }
  const list = available.map((a) => `  - front: "${a.front}", coverage: "${a.coverage}"`).join("\n");
  return {
    ok: false,
    error:
      `No alignment for front="${front}", coverage="${coverage}" on ${variant}, and the front couldn't be parsed as an N-M pattern. ` +
      `Available canonical combos:\n${list}\nCall again with one of these — or pass an N-M front (e.g., "6-2", "5-3") and the synthesizer will place players for you.`,
  };
}

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

const get_route_template: CoachAiTool = {
  def: {
    name: "get_route_template",
    description:
      "Get the CANONICAL geometry, break shape, and prose definition of a named route. " +
      "MANDATORY for every named route you draw or describe. Returns: " +
      "(1) `path` waypoints in yards — drop verbatim into the diagram route's `path`, " +
      "(2) `curve` flag — set the diagram route's `curve` field to this exact value (TRUE for " +
      "rounded routes like curl/hitch/comeback/wheel/fade/sit, FALSE for sharp routes like " +
      "slant/out/in/post/corner/dig), and (3) `description` — the canonical wording to use when " +
      "explaining the route to the coach. Available names (case-insensitive, aliases supported): " +
      "Go (Fly/Streak), Slant, Hitch, Out (Square-Out), In, Post, Corner (Flag), Curl (Hook), " +
      "Comeback, Flat, Wheel, Out & Up, Arrow, Sit (Stick), Drag (Shallow), Seam, Fade, Bubble, " +
      "Spot (Snag), Skinny Post (Glance), Whip, Z-Out, Z-In, Stop & Go (Sluggo), Quick Out (Speed Out), Dig.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Route name or alias (case-insensitive).",
        },
        player_x: {
          type: "number",
          description: "Player's x-position in yards from center of field (negative=left side, positive=right side).",
        },
        player_y: {
          type: "number",
          description: "Player's y-position in yards from LOS (0 = on the line, negative = backfield, positive = downfield).",
        },
      },
      required: ["name", "player_x", "player_y"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const rawName = typeof input.name === "string" ? input.name.trim() : "";
    if (!rawName) return { ok: false, error: "Route name is required." };
    const playerX = typeof input.player_x === "number" ? input.player_x : NaN;
    const playerY = typeof input.player_y === "number" ? input.player_y : NaN;
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) {
      return { ok: false, error: "player_x and player_y must be numbers (yards)." };
    }

    // Lazy import — keep domain types out of module-init order.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ROUTE_TEMPLATES, findTemplate } = require("@/domain/play/routeTemplates") as typeof import("@/domain/play/routeTemplates");

    const template = findTemplate(rawName);
    if (!template) {
      const available = ROUTE_TEMPLATES.map((t) => t.name).join(", ");
      return {
        ok: false,
        error: `Unknown route "${rawName}". Available: ${available}. (Aliases also accepted.)`,
      };
    }

    // Field width depends on variant; field length is 25 yds across all
    // variants (the display window). xSign mirrors the player's side so
    // "outside" in the template means away-from-center for either WR.
    const fieldWidthYds = (() => {
      switch (ctx.sportVariant) {
        case "flag_5v5": return 25;
        case "flag_7v7": return 30;
        case "tackle_11": return 53;
        default: return 40;
      }
    })();
    const fieldLengthYds = 25;
    const xSign = template.directional ? (playerX >= 0 ? 1 : -1) : 1;

    // First point is the player's start (0,0) — Cal's diagram path skips it.
    const waypoints = template.points.slice(1).map((offset) => {
      const xYds = playerX + offset.x * xSign * fieldWidthYds;
      const yYds = playerY + offset.y * fieldLengthYds;
      return [Math.round(xYds * 10) / 10, Math.round(yYds * 10) / 10] as [number, number];
    });

    const curve = template.shapes?.some((s) => s === "curve") ?? false;
    const variantLabel = ctx.sportVariant ?? "flag_7v7";
    const pathJson = JSON.stringify(waypoints);
    const routeJsonFragment =
      `{"from": "<player_id>", "path": ${pathJson}, "tip": "arrow"${curve ? ", \"curve\": true" : ""}}`;

    const dirLabel = (() => {
      switch (template.breakDir) {
        case "toward_qb": return "TOWARD QB / inside (final waypoint moves toward the middle of the field)";
        case "toward_sideline": return "TOWARD SIDELINE / outside (final waypoint moves toward the boundary)";
        case "vertical": return "VERTICAL (final waypoint stays roughly aligned with the player's start)";
        case "varies": return "varies";
      }
    })();

    const { depthRangeYds } = template.constraints;
    return {
      ok: true,
      result:
        `Canonical "${template.name}" (${template.breakStyle} break, ${template.breakDir}) from (${playerX}, ${playerY}) on ${variantLabel}.\n\n` +
        `**Depth range (THE TRUTH — not the prose description): [${depthRangeYds.min}, ${depthRangeYds.max}] yds.** Any depth in this range renders as a valid "${template.name}" with route_kind="${template.name}". The description below describes the canonical/most-common variant — short or long depths within the range are also valid (e.g. a 5-yd Curl in a Curl-Flat concept, an 8-yd Drag in a deep-cross variant). When the coach asks for a depth IN THIS RANGE, just draw it — do NOT call it a "deviation" or "outside catalog".\n\n` +
        `DEFINITION (canonical narrative — paraphrase, don't read verbatim if depths in your draw differ from this prose):\n${template.description}\n\n` +
        `Direction: ${dirLabel}.\n` +
        `path: ${pathJson}\n` +
        `curve: ${curve}\n` +
        `tip: "arrow"\n\n` +
        `Drop into your diagram's "routes" array (copy path AND curve flag exactly):\n${routeJsonFragment}\n\n` +
        `If the coach asks for a depth OUTSIDE [${depthRangeYds.min}, ${depthRangeYds.max}], set \`nonCanonical: true\` on the route to bypass the depth-range validator.`,
    };
  },
};

const get_concept_skeleton: CoachAiTool = {
  def: {
    name: "get_concept_skeleton",
    description:
      "Get a near-complete PlaySpec for a NAMED concept (Mesh, Smash, Curl-Flat, Stick, Snag, Four Verticals, Flood/Sail, Drive, Levels, Y-Cross, Dagger). " +
      "MANDATORY first call when the coach asks for a play built around a catalog concept — the catalog pre-picks player IDs, depths, formation, and complementary " +
      "routes (clear-outs, blocks, flat outlets) so YOU don't have to design 11 player decisions from scratch. " +
      "Returns: (1) `spec` — a complete PlaySpec ready to render, (2) `notes` — a one-line summary of player assignments, (3) `concept` — the canonical name (alias resolution included). " +
      "After calling, optionally tweak 1-2 things (swap a player, adjust a depth via depthYds, add motion). " +
      "If the coach didn't name a catalog concept, OR they want something genuinely off-catalog, skip this tool and author the play manually with named families and depthYds.",
    input_schema: {
      type: "object",
      properties: {
        concept: {
          type: "string",
          description:
            "Concept name (case-insensitive, aliases supported). Examples: \"Mesh\", \"Flood\", \"Sail\" (alias for Flood), \"Curl-Flat\", \"Curl/Flat\", \"Smash\", \"Stick\", \"Snag\", \"Spot\" (alias for Snag), \"Four Verticals\", \"4 Verts\", \"Drive\", \"Levels\", \"Y-Cross\", \"Dagger\".",
        },
        strength: {
          type: "string",
          enum: ["left", "right"],
          description:
            "Strong side for side-flooding concepts (Flood, Sail, Curl-Flat, Smash, Stick, Snag). Defaults to \"right\". Other concepts (Mesh, 4 Verts, Drive, Levels, Y-Cross, Dagger) ignore this field.",
        },
      },
      required: ["concept"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const concept = typeof input.concept === "string" ? input.concept.trim() : "";
    if (!concept) return { ok: false, error: "concept is required." };
    const strengthRaw = typeof input.strength === "string" ? input.strength.toLowerCase() : undefined;
    const strength = strengthRaw === "left" || strengthRaw === "right" ? strengthRaw : undefined;

    // Resolve variant from playbook context. Skeletons are variant-aware
    // (OL only added for tackle_11; player ID conventions match
    // synthesizer output for the requested variant).
    const variant = (ctx.sportVariant as "tackle_11" | "flag_7v7" | "flag_5v5" | undefined) ?? "flag_7v7";

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateConceptSkeleton } = require("@/domain/play/conceptSkeleton") as typeof import("@/domain/play/conceptSkeleton");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { playSpecToCoachDiagram } = require("@/domain/play/specRenderer") as typeof import("@/domain/play/specRenderer");
    const result = generateConceptSkeleton(concept, { variant, strength });

    if (!result.ok) {
      return {
        ok: false,
        error:
          `${result.error}\n\nAvailable concept skeletons: ${result.availableConcepts.join(", ")}.\n` +
          `If the coach didn't name a catalog concept, author the play manually instead of calling this tool.`,
      };
    }

    // Render the spec into a fully-positioned CoachDiagram so Cal can
    // drop it into a `play` fence VERBATIM — no hand-authoring of
    // positions. Surfaced 2026-05-02: even after the skeleton tool
    // shipped, Cal authored a Flood Right play and stacked S+H at the
    // same (x,y) because the spec doesn't carry positions and Cal had
    // to invent them. The renderer's synthesizer places players at
    // canonical, non-overlapping positions for the requested formation
    // — feed Cal the rendered output instead of asking it to position
    // 11 players from scratch.
    const renderResult = playSpecToCoachDiagram(result.spec);
    const renderWarnings = renderResult.warnings.length > 0
      ? `\n\n**Renderer warnings (read but generally ignore — these surface formation/defense fallbacks):**\n${renderResult.warnings.map((w) => `  • [${w.code}] ${w.message}`).join("\n")}`
      : "";

    // Compose the play-fence-ready diagram. We intentionally include the
    // title + variant in the fence shape (Cal's prompt schema for `play`
    // fences expects those) and let Cal trim/extend if customizing.
    const fenceJson = JSON.stringify(
      {
        title: result.spec.title ?? result.concept,
        variant,
        focus: "O",
        ...renderResult.diagram,
      },
      null,
      2,
    );
    const specJson = JSON.stringify(result.spec, null, 2);

    return {
      ok: true,
      result:
        `Skeleton for "${result.concept}" (${variant}${strength ? `, strength=${strength}` : ""}):\n\n` +
        `**Summary:** ${result.notes}\n\n` +
        `**PLAY FENCE — drop this VERBATIM into your reply between \`\`\`play and \`\`\`. Do NOT modify player positions; the synthesizer placed them canonically. You may swap a player ID, adjust a route family/depth, or add motion if the coach asked for those — but DO NOT re-author the players[] array from scratch (that's how the S+H overlap bug happens):**\n` +
        `\`\`\`play\n${fenceJson}\n\`\`\`\n\n` +
        `**PlaySpec — pass this to \`create_play\` if the coach wants to save the play to their playbook:**\n` +
        `\`\`\`json\n${specJson}\n\`\`\`${renderWarnings}\n\n` +
        `Customizations the coach may ask for (apply to BOTH the play fence and the spec): swap player IDs (e.g. coach's team uses "Y" not "S"), adjust a route's depth via \`depthYds\` + add \`nonCanonical: true\` if outside catalog range, add pre-snap motion via \`motion: [...]\` on a route. NEVER reposition players by editing x/y — call \`place_offense\` for an alternate formation if needed.`,
    };
  },
};

const modify_play_route: CoachAiTool = {
  def: {
    name: "modify_play_route",
    description:
      "Surgically modify ONE player on an existing play diagram while preserving everything else (all other players, all other routes, formation, zones, defense). Use this for ANY single-player change — route depth, family, lateral side, modifier, OR token color — instead of re-authoring the diagram. " +
      "Inputs: the prior play fence JSON (copied verbatim from the chat), the player whose entry is changing, and ONE OR MORE of: set_family (swap to a different catalog route), set_depth_yds (adjust the route's depth), set_direction (force lateral side — use for backfield carriers whose flat/swing should go to a specific side regardless of starting x), set_non_canonical (allow off-catalog depth per coach intent), or set_player_color (recolor the player's token — palette name like 'purple' or 'green'). " +
      "Returns the FULL updated play fence JSON ready to drop verbatim into the chat reply. The renderer-validated geometry replaces only the targeted route; nothing else changes. " +
      "**CONCEPT FIDELITY — preserve the spirit of the play.** When the play is a named catalog concept (Mesh, Smash, Curl-Flat, Stick, Snag, Flood/Sail, Drive, Levels, Y-Cross, Dagger, Four Verticals), pick the smallest change that keeps the concept name truthful. Mesh = two crossing drags at differentiated depths — \"make a mesh route deeper\" means deepen ONE drag (e.g. set_depth_yds: 6 on the over-drag), NOT swap a drag for a dig. Smash = hitch + corner — \"deepen the smash\" means tweak the corner depth, not turn the hitch into a curl. If the coach's request would BREAK the concept (e.g. \"replace the drag with a 20yd dig\" on a Mesh play), apply the literal change but the chat-time validator will reject it under assertConcept — better to push back: \"that would turn this into a Drive concept; want me to rebuild it as Drive, or keep it Mesh and deepen the over-drag instead?\". The point of the surgical tool is preserving the play's identity, not just its players[] array.",
    input_schema: {
      type: "object",
      properties: {
        prior_play_fence: {
          type: "string",
          description:
            "The previous diagram JSON, copied verbatim from the most recent ```play fence in the chat (between the opening ```play and closing ```). MUST include all players, routes, and any zones from that diagram. The tool parses this and applies the requested route change additively — every other player and route round-trips unchanged.",
        },
        player: {
          type: "string",
          description:
            "The player ID whose route is being modified (e.g. \"H\", \"X\", \"S\"). Must match a route in prior_play_fence's routes[] array.",
        },
        set_family: {
          type: "string",
          description:
            "Optional: change the route to a different catalog family (Slant, Curl, Drag, Dig, etc.). When set, the new path is computed from the catalog template — coach-canonical, no hand authoring. Aliases supported.",
        },
        set_depth_yds: {
          type: "number",
          description:
            "Optional: scale the route's depth so its deepest waypoint lands at this many yards from the LOS. Honored regardless of family change. Out-of-catalog depths require set_non_canonical: true.",
        },
        set_direction: {
          type: "string",
          enum: ["left", "right"],
          description:
            "Optional: force the route's lateral direction (left/right). Use for backfield carriers (RB) whose flat/swing should go to a specific side regardless of starting x — e.g. an RB flat to the flood side. The route's existing direction is preserved across depth/family edits when this is omitted.",
        },
        set_non_canonical: {
          type: "boolean",
          description:
            "Optional: set the nonCanonical flag on the route, bypassing the catalog depth-range validator. Use ONLY when the coach explicitly requested an unusual depth.",
        },
        set_player_color: {
          type: "string",
          enum: ["red", "orange", "yellow", "green", "blue", "purple", "black", "white", "gray"],
          description:
            "Optional: recolor this player's token to the named palette color. Identity-preserving (no position change). Works on any player, route or no route. Use when the coach asks for a recolor ('make @H purple', 'change the slot to green').",
        },
      },
      required: ["prior_play_fence", "player"],
      additionalProperties: false,
    },
  },
  async handler(input) {
    // Delegate to applyRouteMods — the single source of geometric truth for
    // route mutations (AGENTS.md Rule 10). This eliminates the duplicated
    // xSign math that used to live here, which silently dropped the
    // route's `direction` field and flipped Flood Left's @B flat to the
    // right on any depth/family edit. Surfaced 2026-05-02 (fourth Flood
    // direction bug). The single-mod shape mirrors `revise_play`'s array
    // entry shape so both tools stay in lockstep.
    const priorJson = typeof input.prior_play_fence === "string" ? input.prior_play_fence.trim() : "";
    const player = typeof input.player === "string" ? input.player.trim() : "";
    if (!priorJson) return { ok: false, error: "prior_play_fence is required (copy the previous play fence verbatim)." };
    if (!player) return { ok: false, error: "player is required." };

    const setFamily = typeof input.set_family === "string" && input.set_family.trim() !== ""
      ? input.set_family.trim()
      : undefined;
    const setDepth = typeof input.set_depth_yds === "number" && Number.isFinite(input.set_depth_yds)
      ? input.set_depth_yds
      : undefined;
    const setNonCanonical = typeof input.set_non_canonical === "boolean" ? input.set_non_canonical : undefined;
    const setDirection = input.set_direction === "left" || input.set_direction === "right"
      ? input.set_direction
      : undefined;
    const setPlayerColor = typeof input.set_player_color === "string" ? input.set_player_color : undefined;

    if (
      setFamily === undefined &&
      setDepth === undefined &&
      setNonCanonical === undefined &&
      setDirection === undefined &&
      setPlayerColor === undefined
    ) {
      return { ok: false, error: "At least one of set_family / set_depth_yds / set_direction / set_non_canonical / set_player_color must be provided." };
    }

    const mod: RouteMod = { player };
    if (setFamily !== undefined) mod.set_family = setFamily;
    if (setDepth !== undefined) mod.set_depth_yds = setDepth;
    if (setNonCanonical !== undefined) mod.set_non_canonical = setNonCanonical;
    if (setDirection !== undefined) mod.set_direction = setDirection;
    if (setPlayerColor !== undefined) mod.set_player_color = setPlayerColor as RouteMod["set_player_color"];

    const r = applyRouteMods(priorJson, [mod]);
    if (!r.ok) {
      return { ok: false, error: r.errors.join("\n") };
    }
    const fenceJson = JSON.stringify(r.fence, null, 2);

    const changeSummary: string[] = [];
    if (setFamily !== undefined) changeSummary.push(`route family → "${setFamily}"`);
    if (setDepth !== undefined) changeSummary.push(`depth → ${setDepth} yds`);
    if (setDirection !== undefined) changeSummary.push(`direction → ${setDirection}`);
    if (setNonCanonical !== undefined) changeSummary.push(`nonCanonical → ${setNonCanonical}`);
    if (setPlayerColor !== undefined) changeSummary.push(`color → ${setPlayerColor}`);

    return {
      ok: true,
      result:
        `Modified @${player}'s route (${changeSummary.join(", ")}). All other players, routes, and zones preserved verbatim from the prior diagram.\n\n` +
        `**PLAY FENCE — drop VERBATIM into your reply between \`\`\`play and \`\`\`. Do NOT re-author other parts of the diagram:**\n` +
        `\`\`\`play\n${fenceJson}\n\`\`\``,
    };
  },
};

const add_defense_to_play: CoachAiTool = {
  def: {
    name: "add_defense_to_play",
    description:
      "Overlay a defensive scheme (front + coverage) onto an EXISTING play diagram while preserving ALL offense (players, routes, zones from offense) untouched. Use this for ANY \"show this play vs Cover X\" / \"add the defense to this play\" / \"how does Tampa 2 defend this\" request — instead of re-authoring the play with both sides, this tool overlays defense surgically. " +
      "Inputs: the prior play fence JSON (copied verbatim) plus front + coverage + optional strength. Any existing defenders in the prior fence are STRIPPED and replaced with the new scheme; the offense is identical, byte-for-byte, in the output. " +
      "Returns the FULL updated play fence JSON ready to drop verbatim.",
    input_schema: {
      type: "object",
      properties: {
        prior_play_fence: {
          type: "string",
          description:
            "The previous diagram JSON, copied verbatim from the most recent ```play fence in the chat. Offense players + routes are preserved exactly; any defense (team:\"D\") in this input is replaced.",
        },
        front: {
          type: "string",
          description:
            "Defensive front name. Examples: \"4-3 Over\", \"3-4\", \"Nickel (4-2-5)\", \"7v7 Zone\", \"5v5 Man\".",
        },
        coverage: {
          type: "string",
          description: "Coverage name. Examples: \"Cover 1\", \"Cover 2\", \"Cover 3\", \"Cover 4 (Quarters)\".",
        },
        strength: {
          type: "string",
          enum: ["left", "right"],
          description:
            "Side the offensive strength is on (defaults to right). The defense rotates toward strength.",
        },
      },
      required: ["prior_play_fence", "front", "coverage"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const priorJson = typeof input.prior_play_fence === "string" ? input.prior_play_fence.trim() : "";
    const front = typeof input.front === "string" ? input.front.trim() : "";
    const coverage = typeof input.coverage === "string" ? input.coverage.trim() : "";
    if (!priorJson) return { ok: false, error: "prior_play_fence is required." };
    if (!front || !coverage) return { ok: false, error: "front and coverage are required." };
    const strength: "left" | "right" = input.strength === "left" ? "left" : "right";

    let fence: Record<string, unknown>;
    try {
      fence = JSON.parse(priorJson);
    } catch (e) {
      return { ok: false, error: `Could not parse prior_play_fence as JSON: ${(e as Error).message}` };
    }

    const variantStr = typeof fence.variant === "string" ? fence.variant : ctx.sportVariant ?? "flag_7v7";
    const alignment = computeDefenseAlignment(variantStr, front, coverage, strength);
    if (!alignment.ok) return alignment;

    // Strip any existing defenders from the prior fence — the new scheme
    // replaces them. Offense (team !== "D") and the rest of the fence are
    // preserved unchanged.
    const playersArr = Array.isArray(fence.players) ? (fence.players as Array<Record<string, unknown>>) : [];
    const offenseOnly = playersArr.filter((p) => p.team !== "D");

    // Suffix duplicate role labels (two DTs → DT, DT2; two CBs → CB, CB2)
    // so every defender has a unique diagram id.
    const seenDefIds = new Map<string, number>();
    const newDefenders = alignment.players.map((p) => {
      const count = (seenDefIds.get(p.id) ?? 0) + 1;
      seenDefIds.set(p.id, count);
      return {
        id: count === 1 ? p.id : `${p.id}${count}`,
        role: p.id,
        x: p.x,
        y: p.y,
        team: "D" as const,
      };
    });

    const isMan = alignment.manCoverage;
    // Emit only the zones that some defender actually drops into (per
    // the catalog's per-defender assignments, surfaced via ownerLabel).
    // Cover 1 keeps the FS deep-middle zone; Cover 0 emits nothing.
    const newZones = alignment.zones
      .filter((z) => z.ownerLabel)
      .map((z) => ({
        kind: z.kind,
        center: z.center,
        size: z.size,
        label: z.label,
        ownerLabel: z.ownerLabel,
      }));

    // Compose new fence: offense unchanged + new defenders + new zones (or
    // empty zones for man coverage). Preserve title/variant/focus/etc. from
    // the prior fence so the chat header doesn't churn.
    const newFence: Record<string, unknown> = {
      ...fence,
      players: [...offenseOnly, ...newDefenders],
    };
    if (isMan) {
      // Man coverage: clear zones array (or leave it absent).
      delete newFence.zones;
    } else {
      newFence.zones = newZones;
    }

    const fenceJson = JSON.stringify(newFence, null, 2);

    const summaryLines: string[] = [
      `Added "${alignment.front} / ${alignment.coverage}" defense (${alignment.variant}, strength=${strength}) to the existing play. Offense preserved verbatim — only defenders + zones changed.`,
      alignment.description,
    ];
    if (isMan) {
      summaryLines.push(
        "",
        "MAN COVERAGE: no zones drawn. If the coach wants assignment lines, " +
        "use modify_play_route to add a route on each defender to their matched receiver.",
      );
    }

    return {
      ok: true,
      result:
        `${summaryLines.join("\n")}\n\n` +
        `**PLAY FENCE — drop VERBATIM into your reply. Offense is byte-for-byte identical to the prior diagram; only defense changed:**\n` +
        `\`\`\`play\n${fenceJson}\n\`\`\``,
    };
  },
};

// ── compose_play / revise_play (Pillars 1 + 2 of the 2026-05-02 refactor) ─
// These tools replace the freehand-fence-emit path for catalog plays.
//
// compose_play: ONE tool that takes intent (concept name + optional
// strength + optional overrides) and returns a complete validated
// fence. The skeleton + override application + sanitizer all run
// together — Cal cannot freelance route geometry because Cal never
// authors waypoints.
//
// revise_play: identity-preserving batched edits. Accepts an array of
// route mods and returns a fence whose players[] is byte-identical to
// the input. Replaces the per-call modify_play_route loop and makes
// "Why did you flip it?" structurally impossible.
//
// Both tools route through the same play-mutations helpers, which
// route through the same sanitizer the renderer uses. Single source of
// geometric truth — AGENTS.md hard-rule layer 5.
const compose_play: CoachAiTool = {
  def: {
    name: "compose_play",
    description:
      "Compose a complete play diagram from a CATALOG CONCEPT (Mesh, Smash, Curl-Flat, Stick, Snag, Four Verticals, Flood/Sail, Drive, Levels, Y-Cross, Dagger). " +
      "MANDATORY first call when a coach asks for a named-concept play — Cal does not freelance route geometry; the catalog + renderer produce coach-canonical depths and player roles. " +
      "Inputs: " +
      "(1) `concept` — the catalog name (case-insensitive, aliases supported). " +
      "(2) `strength` — optional, for side-flooding concepts (Flood, Smash, Curl-Flat, Stick, Snag): 'left' or 'right'. " +
      "(3) `overrides` — optional array of intent-level route changes to apply on top of the canonical skeleton, e.g. [{ player: 'H', set_depth_yds: 5 }, { player: 'Z', set_family: 'Post' }]. " +
      "Returns: a SANITIZED ```play fence ready to drop verbatim into the reply, plus the matching PlaySpec for create_play. The skeleton's canonical depths (e.g. Mesh under-drag @ 2yd, over-drag @ 6yd) are baked into the path waypoints; do NOT re-derive geometry via get_route_template after this tool runs.",
    input_schema: {
      type: "object",
      properties: {
        concept: { type: "string", description: "Catalog concept name (Mesh, Flood, Sail, Curl-Flat, Smash, Stick, Snag, Four Verticals, 4 Verts, Drive, Levels, Y-Cross, Dagger). Aliases supported." },
        strength: { type: "string", enum: ["left", "right"], description: "Strong side for side-flooding concepts. Defaults to 'right'." },
        overrides: {
          type: "array",
          description: "Optional intent-level route changes applied on top of the skeleton. Each item: { player, set_family?, set_depth_yds?, set_non_canonical? }. Use this when the coach asks for a custom variant on a catalog play (e.g. 'mesh with the over-drag at 8 yards' → overrides: [{ player: 'S', set_depth_yds: 8, set_non_canonical: true }]).",
          items: {
            type: "object",
            properties: {
              player: { type: "string" },
              set_family: { type: "string" },
              set_depth_yds: { type: "number" },
              set_non_canonical: { type: "boolean" },
              set_direction: { type: "string", enum: ["left", "right"], description: "Force the route's lateral direction (left/right). Use for backfield carriers (RB) whose flat/swing should go to a specific side regardless of starting x — e.g. an RB flat to the flood side." },
            },
            required: ["player"],
            additionalProperties: false,
          },
        },
      },
      required: ["concept"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const concept = typeof input.concept === "string" ? input.concept.trim() : "";
    if (!concept) return { ok: false, error: "concept is required." };
    const strengthRaw = typeof input.strength === "string" ? input.strength.toLowerCase() : undefined;
    const strength = strengthRaw === "left" || strengthRaw === "right" ? strengthRaw : undefined;
    const overrides = Array.isArray(input.overrides) ? (input.overrides as RouteMod[]) : [];

    const variant = (ctx.sportVariant as "tackle_11" | "flag_7v7" | "flag_5v5" | undefined) ?? "flag_7v7";

    const result = generateConceptSkeleton(concept, { variant, strength });
    if (!result.ok) {
      return {
        ok: false,
        error:
          `${result.error}\n\nAvailable concepts: ${result.availableConcepts.join(", ")}.\n` +
          `If the coach didn't name a catalog concept, this tool can't help — they want something off-catalog and you'll need to author the play another way.`,
      };
    }

    const renderResult = playSpecToCoachDiagram(result.spec);
    let fence = {
      title: result.spec.title ?? result.concept,
      variant,
      focus: "O" as const,
      ...renderResult.diagram,
    };

    // Apply overrides on the canonical skeleton fence. Each override
    // is a route mod (depth/family/nonCanonical) applied via the
    // shared play-mutations helper, so the geometry is recomputed
    // from the catalog template and every override stays
    // identity-preserving.
    let appliedOverrides: string[] = [];
    if (overrides.length > 0) {
      const applied = applyRouteMods(JSON.stringify(fence), overrides, variant);
      if (!applied.ok) {
        return {
          ok: false,
          error:
            `Concept skeleton built, but overrides failed:\n${applied.errors.map((e) => `  • ${e}`).join("\n")}\n` +
            `Drop the overrides that don't apply, or correct the player IDs / depths and call again.`,
        };
      }
      fence = applied.fence as typeof fence;
      appliedOverrides = applied.appliedSummaries;
    }

    const fenceJson = JSON.stringify(fence, null, 2);
    const specJson = JSON.stringify(result.spec, null, 2);
    const renderWarnings = renderResult.warnings.length > 0
      ? `\n\n**Renderer warnings (informational; the diagram still rendered):**\n${renderResult.warnings.map((w) => `  • [${w.code}] ${w.message}`).join("\n")}`
      : "";
    const overridesNote = appliedOverrides.length > 0
      ? `\n\n**Overrides applied:** ${appliedOverrides.join("; ")}.`
      : "";

    return {
      ok: true,
      result:
        `Composed "${result.concept}" (${variant}${strength ? `, strength=${strength}` : ""}):\n\n` +
        `**Summary:** ${result.notes}${overridesNote}\n\n` +
        `**PLAY FENCE — drop VERBATIM into your reply between \`\`\`play and \`\`\`. Geometry is coach-canonical and sanitized; do NOT call get_route_template for any route in this fence — the depths are already correct:**\n` +
        `\`\`\`play\n${fenceJson}\n\`\`\`\n\n` +
        `**PlaySpec — pass to create_play if the coach wants the play saved to their playbook:**\n` +
        `\`\`\`json\n${specJson}\n\`\`\`${renderWarnings}\n\n` +
        `Customizations the coach may ask for AFTER this fence is in chat: call \`revise_play\` (NOT compose_play again — that would reset other tweaks). \`revise_play\` takes the fence + an array of route mods and preserves players[] verbatim.`,
    };
  },
};

const revise_play: CoachAiTool = {
  def: {
    name: "revise_play",
    description:
      "Apply a batch of intent-level route mods to an existing play diagram while PRESERVING every player position, ID, and team byte-for-byte. Use this for ANY edit to a play that already exists in the chat — single-route changes ('make the drag deeper'), multi-route changes ('change @Z to a Post AND deepen @X to 12 yards'), concept-faithful tweaks (deepening one of two mesh drags), AND token recoloring ('make @H purple', 'change the slot to green'). " +
      "Inputs: " +
      "(1) `prior_play_fence` — the previous diagram JSON, copied verbatim from the chat. " +
      "(2) `mods` — array of route changes; each item: { player, set_family?, set_depth_yds?, set_non_canonical?, set_direction?, set_player_color? }. " +
      "Returns: a SANITIZED full fence with the requested changes applied. The tool REJECTS any mod that would change player IDs, positions, or team — those edits go through different paths (place_offense for formation changes; the user explicitly asking for a 'new play'). " +
      "**CONCEPT FIDELITY**: when the play is a named catalog concept (Mesh, Smash, etc.), pick mods that keep the concept truthful. Mesh = two crossing drags at differentiated depths — 'make a mesh route deeper' means deepen ONE drag (e.g. set_depth_yds: 6 on the over-drag), NOT swap a drag for a dig. The chat-time validator catches concept-breaking mods via assertConcept; better to push back than ship a mod that fails. " +
      "**RECOLORING**: when the coach asks to change a player's color, pass `set_player_color` with one of the palette names (red/orange/yellow/green/blue/purple/black/white/gray). Color mods are identity-preserving — they DO NOT require an existing route, so they work on defenders or any player without a route. Combine with route mods on the same player in a single mod entry (e.g. `{ player: 'H', set_depth_yds: 8, set_player_color: 'purple' }`).",
    input_schema: {
      type: "object",
      properties: {
        prior_play_fence: {
          type: "string",
          description: "The previous diagram JSON, copied verbatim from the most recent ```play fence in the chat (the entire body between the opening ```play and closing ```). MUST include all players, routes, and any zones from that diagram.",
        },
        mods: {
          type: "array",
          description: "Array of intent-level mods. Each item: { player: 'X', set_family?: 'Post', set_depth_yds?: 12, set_non_canonical?: true, set_player_color?: 'purple' }. Multiple mods apply atomically — if any one is invalid, the whole batch rejects.",
          items: {
            type: "object",
            properties: {
              player: { type: "string" },
              set_family: { type: "string" },
              set_depth_yds: { type: "number" },
              set_non_canonical: { type: "boolean" },
              set_direction: { type: "string", enum: ["left", "right"], description: "Force the route's lateral direction (left/right). Use for backfield carriers (RB) whose flat/swing should go to a specific side regardless of starting x — e.g. an RB flat to the flood side." },
              set_player_color: {
                type: "string",
                enum: ["red", "orange", "yellow", "green", "blue", "purple", "black", "white", "gray"],
                description: "Recolor the player's token to a palette color. Use when the coach explicitly asks ('make @H purple', 'change the slot to green'). The mod is identity-preserving (no position change) and works on any player — defender or offense, with or without a route. Prefer this over hand-editing the fence's player.color field.",
              },
            },
            required: ["player"],
            additionalProperties: false,
          },
        },
      },
      required: ["prior_play_fence", "mods"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const priorJson = typeof input.prior_play_fence === "string" ? input.prior_play_fence : "";
    const mods = Array.isArray(input.mods) ? (input.mods as RouteMod[]) : [];

    const variant = (ctx.sportVariant as "tackle_11" | "flag_7v7" | "flag_5v5" | undefined);
    const r = applyRouteMods(priorJson, mods, variant);
    if (!r.ok) {
      return {
        ok: false,
        error: `revise_play failed:\n${r.errors.map((e) => `  • ${e}`).join("\n")}`,
      };
    }
    const fenceJson = JSON.stringify(r.fence, null, 2);
    return {
      ok: true,
      result:
        `Applied ${r.appliedSummaries.length} mod(s): ${r.appliedSummaries.join("; ")}.\n` +
        `All other players, routes, and zones are byte-identical to the prior diagram.\n\n` +
        `**PLAY FENCE — drop VERBATIM into your reply between \`\`\`play and \`\`\`:**\n` +
        `\`\`\`play\n${fenceJson}\n\`\`\``,
    };
  },
};

// ── compose_defense (Pillar 4 — symmetric defender pipeline) ──────────────
// One tool replaces both place_defense (defense-only) and
// add_defense_to_play (overlay-on-play). The unified shape:
//   - omit on_play  → returns a defense-only fence
//   - pass on_play  → overlays defense onto the prior play, preserving
//                     offense byte-for-byte
// Sanitized output guarantees zones never paint the whole field
// (image-3 case from 2026-05-02). Old tools stay as legacy aliases so
// existing chats continue to work.
const compose_defense: CoachAiTool = {
  def: {
    name: "compose_defense",
    description:
      "Compose a defensive scheme — either standalone (returns a defense-only diagram) OR overlayed onto an existing play (preserves offense byte-for-byte). Use this for ANY defense placement: 'show me a 4-3 Cover 3', 'show this play vs Tampa 2', 'add the defense', 'how does Cover 1 defend this'. " +
      "Inputs: " +
      "(1) `front` — defensive front (e.g. '4-3 Over', 'Nickel (4-2-5)', '7v7 Zone'). " +
      "(2) `coverage` — coverage name ('Cover 1', 'Cover 3', 'Tampa 2'). " +
      "(3) `strength` — optional, 'left' or 'right' (default 'right'). " +
      "(4) `on_play` — optional. When provided, the defense is overlayed onto this prior ```play fence, preserving offense exactly; any existing defenders in the prior fence are stripped and replaced. When omitted, returns a defense-only diagram. " +
      "Output is sanitized — zones cannot exceed field bounds, NaN coordinates are dropped, etc.",
    input_schema: {
      type: "object",
      properties: {
        front:    { type: "string" },
        coverage: { type: "string" },
        strength: { type: "string", enum: ["left", "right"] },
        on_play:  { type: "string", description: "Optional. The previous ```play fence JSON (verbatim). When provided, defense is overlayed; offense is preserved unchanged." },
      },
      required: ["front", "coverage"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const front = typeof input.front === "string" ? input.front.trim() : "";
    const coverage = typeof input.coverage === "string" ? input.coverage.trim() : "";
    if (!front || !coverage) return { ok: false, error: "front and coverage are required." };
    const strength: "left" | "right" = input.strength === "left" ? "left" : "right";
    const onPlayRaw = typeof input.on_play === "string" ? input.on_play.trim() : "";

    const variant = (ctx.sportVariant as "tackle_11" | "flag_7v7" | "flag_5v5" | undefined) ?? "flag_7v7";
    const alignment = computeDefenseAlignment(variant, front, coverage, strength);
    if (!alignment.ok) return alignment;

    // Suffix duplicate ids — same logic as place_defense / add_defense_to_play.
    const seenIds = new Map<string, number>();
    const uniqueDefenders = alignment.players.map((p) => {
      const count = (seenIds.get(p.id) ?? 0) + 1;
      seenIds.set(p.id, count);
      return {
        id: count === 1 ? p.id : `${p.id}${count}`,
        role: p.id,
        x: p.x,
        y: p.y,
        team: "D" as const,
      };
    });

    const isMan = alignment.manCoverage;
    const zones = isMan
      ? []
      : alignment.zones.map((z) => ({ kind: z.kind, center: z.center, size: z.size, label: z.label }));

    let fence: Record<string, unknown>;
    if (onPlayRaw) {
      try {
        fence = JSON.parse(onPlayRaw);
      } catch (e) {
        return { ok: false, error: `Could not parse on_play as JSON: ${(e as Error).message}` };
      }
      const priorPlayers = Array.isArray(fence.players) ? (fence.players as Array<Record<string, unknown>>) : [];
      const offenseOnly = priorPlayers.filter((p) => p.team !== "D");
      fence = {
        ...fence,
        players: [...offenseOnly, ...uniqueDefenders],
      };
      if (zones.length > 0) fence.zones = zones;
      else delete fence.zones;
    } else {
      // Defense-only fence: title from the scheme, no offense.
      fence = {
        title: `${alignment.front} ${alignment.coverage}`,
        variant,
        focus: "D",
        players: uniqueDefenders,
        routes: [],
        ...(zones.length > 0 ? { zones } : {}),
      };
    }

    // Sanitize — drops oversize zones and any other corrupt geometry
    // before the fence reaches the coach.
    const sanitized = sanitizeCoachDiagram(fence as import("@/features/coach-ai/coachDiagramConverter").CoachDiagram, variant);
    const finalFence = {
      ...fence,
      players: sanitized.diagram.players,
      routes: sanitized.diagram.routes,
      zones: sanitized.diagram.zones,
    };
    const fenceJson = JSON.stringify(finalFence, null, 2);

    const summary = onPlayRaw
      ? `Overlayed "${alignment.front} / ${alignment.coverage}" defense onto the prior play (${alignment.variant}, strength=${strength}). Offense byte-identical; defense replaced.`
      : `Composed "${alignment.front} / ${alignment.coverage}" (${alignment.variant}, strength=${strength}, defense-only).`;
    const sanitizerNote = sanitized.warnings.length > 0
      ? `\n\nSanitizer cleaned up ${sanitized.warnings.length} corrupt element(s) before output:\n${sanitized.warnings.map((w) => `  • [${w.code}] ${w.message}`).join("\n")}`
      : "";
    const manNote = isMan ? `\n\nMAN COVERAGE: zones omitted. If the coach wants assignment lines, use \`set_defender_assignment\` per defender.` : "";

    return {
      ok: true,
      result:
        `${summary}\n${alignment.description}${manNote}${sanitizerNote}\n\n` +
        `**PLAY FENCE — drop VERBATIM into your reply between \`\`\`play and \`\`\`:**\n` +
        `\`\`\`play\n${fenceJson}\n\`\`\``,
    };
  },
};

const set_defender_assignment: CoachAiTool = {
  def: {
    name: "set_defender_assignment",
    description:
      "Surgically change ONE defender's assignment on an existing play diagram while preserving every other player, route, and zone. Use this whenever the coach asks 'what about ML — have him blitz instead', 'have the FS play robber', 'put CB1 in man on Z'. " +
      "Inputs: the prior play fence JSON (copied verbatim), the defender id, and an action object describing the new role. " +
      "Action shapes: " +
      "{ kind: \"zone_drop\", zoneId, zoneLabel, center: [x,y], size: [w,h] } — defender drops into a zone (omit per-defender route, ensure the zone shape is in zones[]); " +
      "{ kind: \"man_match\", target } — defender matches the named offensive player (replaces route with an arrow to the target); " +
      "{ kind: \"blitz\", gap } — defender rushes through the named gap (A/B/C/D/edge); " +
      "{ kind: \"spy\", target } — defender mirrors a player; " +
      "{ kind: \"custom_path\", waypoints, curve } — hand-drawn path; " +
      "{ kind: \"read_and_react\", trigger: { player, on? }, behavior } — defender reacts to a specific offensive player's action (Phase D7); behavior is one of jump_route, carry_vertical, follow_to_flat, wall_off, robber. " +
      "Returns the FULL updated play fence JSON ready to drop verbatim. Use modify_play_route for offensive route changes, place_defense for the initial defense placement, and this tool for any single-defender role change.",
    input_schema: {
      type: "object",
      properties: {
        prior_play_fence: {
          type: "string",
          description:
            "The previous diagram JSON, copied verbatim from the most recent ```play fence in the chat. MUST include all players, routes, and zones from that diagram.",
        },
        defender: {
          type: "string",
          description:
            "Defender id whose assignment is changing (e.g. \"FS\", \"ML\", \"CB\"). Must match a player in prior_play_fence.players where team === \"D\".",
        },
        action: {
          type: "object",
          description:
            "The defender's new role. Shape varies by kind — see tool description for variants.",
        },
      },
      required: ["prior_play_fence", "defender", "action"],
      additionalProperties: false,
    },
  },
  async handler(input) {
    const priorJson = typeof input.prior_play_fence === "string" ? input.prior_play_fence.trim() : "";
    const defender = typeof input.defender === "string" ? input.defender.trim() : "";
    const action = (input.action ?? {}) as Record<string, unknown>;
    if (!priorJson) return { ok: false, error: "prior_play_fence is required (copy the previous play fence verbatim)." };
    if (!defender) return { ok: false, error: "defender is required." };
    const kind = typeof action.kind === "string" ? action.kind : "";
    const allowed = ["zone_drop", "man_match", "blitz", "spy", "custom_path", "read_and_react"];
    if (!allowed.includes(kind)) {
      return { ok: false, error: `action.kind must be one of: ${allowed.join(", ")}.` };
    }

    let fence: Record<string, unknown>;
    try {
      fence = JSON.parse(priorJson);
    } catch (e) {
      return { ok: false, error: `Could not parse prior_play_fence as JSON: ${(e as Error).message}` };
    }

    const playersArr = Array.isArray(fence.players) ? (fence.players as Array<Record<string, unknown>>) : [];
    const routesArr = Array.isArray(fence.routes) ? (fence.routes as Array<Record<string, unknown>>) : [];
    const zonesArr = Array.isArray(fence.zones) ? (fence.zones as Array<Record<string, unknown>>) : [];

    const defenderPlayer = playersArr.find((p) => p.id === defender && p.team === "D");
    if (!defenderPlayer) {
      const defs = playersArr.filter((p) => p.team === "D").map((p) => p.id).join(", ");
      return { ok: false, error: `Defender "${defender}" not in prior_play_fence.players (team="D"). Available: ${defs || "(none)"}.` };
    }
    const dx = typeof defenderPlayer.x === "number" ? defenderPlayer.x : 0;
    const dy = typeof defenderPlayer.y === "number" ? defenderPlayer.y : 0;

    // Remove any existing route emanating from this defender — the new
    // action's projection replaces it.
    const remainingRoutes = routesArr.filter((r) => r.from !== defender);

    let newRoute: Record<string, unknown> | null = null;
    let newZones = zonesArr;
    let summary = "";

    switch (kind) {
      case "zone_drop": {
        const zoneLabel = typeof action.zoneLabel === "string" ? action.zoneLabel : (typeof action.zoneId === "string" ? action.zoneId : "Zone");
        const center = Array.isArray(action.center) ? action.center as [number, number] : [dx, dy + 4];
        const size = Array.isArray(action.size) ? action.size as [number, number] : [8, 8];
        // Add the zone if not already present (matched by label).
        const exists = zonesArr.some((z) => z.label === zoneLabel);
        newZones = exists
          ? zonesArr
          : [...zonesArr, { kind: "rectangle", center, size, label: zoneLabel }];
        summary = `${defender} drops into ${zoneLabel}`;
        break;
      }
      case "man_match": {
        const target = typeof action.target === "string" ? action.target : "";
        if (!target) return { ok: false, error: "man_match requires action.target (offensive player id)." };
        const tgt = playersArr.find((p) => p.id === target && p.team !== "D");
        if (!tgt) {
          const offs = playersArr.filter((p) => p.team !== "D").map((p) => p.id).join(", ");
          return { ok: false, error: `man_match target "${target}" not in prior_play_fence offense. Available: ${offs}.` };
        }
        const tx = typeof tgt.x === "number" ? tgt.x : 0;
        const ty = typeof tgt.y === "number" ? tgt.y : 0;
        const ddx = tx - dx, ddy = ty - dy;
        const len = Math.hypot(ddx, ddy);
        if (len < 0.5) {
          newRoute = { from: defender, path: [[tx, ty]], tip: "arrow", startDelaySec: 0.2 };
        } else {
          const ratio = (len - 1) / len;
          const ex = Math.round((dx + ddx * ratio) * 10) / 10;
          const ey = Math.round((dy + ddy * ratio) * 10) / 10;
          newRoute = { from: defender, path: [[ex, ey]], tip: "arrow", startDelaySec: 0.2 };
        }
        summary = `${defender} man on ${target}`;
        break;
      }
      case "blitz": {
        const gap = typeof action.gap === "string" ? action.gap : "A";
        const widths: Record<string, number> = { A: 1.5, B: 3.5, C: 6, D: 9, edge: 10.5 };
        const gx = widths[gap] ?? 1.5;
        const xSign = dx === 0 ? 1 : (dx > 0 ? 1 : -1);
        newRoute = { from: defender, path: [[Math.round(xSign * gx * 10) / 10, 0]], tip: "arrow", startDelaySec: 0 };
        summary = `${defender} blitz ${gap}-gap`;
        break;
      }
      case "spy": {
        newRoute = { from: defender, path: [[Math.round((dx + 0.5) * 10) / 10, Math.round((dy - 0.5) * 10) / 10]], tip: "none", startDelaySec: 0 };
        summary = `${defender} spy${typeof action.target === "string" ? ` ${action.target}` : ""}`;
        break;
      }
      case "custom_path": {
        const waypoints = Array.isArray(action.waypoints) ? action.waypoints : null;
        if (!waypoints || waypoints.length === 0) return { ok: false, error: "custom_path requires action.waypoints (non-empty [[x,y], ...])." };
        newRoute = { from: defender, path: waypoints, tip: "arrow", ...(action.curve ? { curve: true } : {}) };
        summary = `${defender} custom path (${waypoints.length} waypoints)`;
        break;
      }
      case "read_and_react": {
        const trigger = (action.trigger ?? {}) as Record<string, unknown>;
        const triggerPlayerId = typeof trigger.player === "string" ? trigger.player : "";
        const behavior = typeof action.behavior === "string" ? action.behavior : "";
        const allowedBehaviors = ["jump_route", "carry_vertical", "follow_to_flat", "wall_off", "robber"];
        if (!triggerPlayerId) return { ok: false, error: "read_and_react requires action.trigger.player (the offensive player to read)." };
        if (!allowedBehaviors.includes(behavior)) return { ok: false, error: `read_and_react.behavior must be one of: ${allowedBehaviors.join(", ")}.` };
        const tgt = playersArr.find((p) => p.id === triggerPlayerId && p.team !== "D");
        if (!tgt) {
          const offs = playersArr.filter((p) => p.team !== "D").map((p) => p.id).join(", ");
          return { ok: false, error: `read_and_react trigger "${triggerPlayerId}" not in prior_play_fence offense. Available: ${offs}.` };
        }
        const tx = typeof tgt.x === "number" ? tgt.x : 0;
        const ty = typeof tgt.y === "number" ? tgt.y : 0;
        // Geometry mirrors specRenderer.reactivePathFor — keep these in
        // sync (one fix here = one fix there).
        let path: number[][];
        switch (behavior) {
          case "jump_route": {
            const ddx = tx - dx, ddy = ty - dy;
            const len = Math.hypot(ddx, ddy) || 1;
            const ratio = Math.max(0.1, (len - 2) / len);
            path = [[Math.round((dx + ddx * ratio) * 10) / 10, Math.round((dy + ddy * ratio) * 10) / 10]];
            break;
          }
          case "carry_vertical": {
            const xSign = tx >= 0 ? 1 : -1;
            path = [[Math.round(dx * 10) / 10, Math.round((dy + 5) * 10) / 10], [Math.round((dx - xSign * 2) * 10) / 10, Math.round((dy + 7) * 10) / 10]];
            break;
          }
          case "follow_to_flat": {
            const xSign = tx >= 0 ? 1 : -1;
            path = [[Math.round((dx + xSign * 3) * 10) / 10, Math.round((dy - 1) * 10) / 10], [Math.round((dx + xSign * 8) * 10) / 10, Math.round((dy - 2) * 10) / 10]];
            break;
          }
          case "wall_off": {
            path = [[Math.round(((dx + tx) / 2) * 10) / 10, Math.round(dy * 10) / 10]];
            break;
          }
          case "robber": {
            path = [[0, 8]];
            break;
          }
          default:
            path = [];
        }
        newRoute = {
          from: defender,
          path,
          tip: "arrow",
          startDelaySec: 0.6,
          route_kind: `react_${behavior}`,
        };
        summary = `${defender} reads @${triggerPlayerId} → ${behavior}`;
        break;
      }
    }

    const finalRoutes = newRoute ? [...remainingRoutes, newRoute] : remainingRoutes;
    const newFence: Record<string, unknown> = {
      ...fence,
      routes: finalRoutes,
    };
    if (newZones.length > 0) newFence.zones = newZones;
    else delete newFence.zones;

    const fenceJson = JSON.stringify(newFence, null, 2);
    return {
      ok: true,
      result:
        `Surgical defender update — ${summary}. Every other player, route, and zone preserved verbatim from the prior diagram.\n\n` +
        `**PLAY FENCE — drop VERBATIM into your reply between \`\`\`play and \`\`\`:**\n` +
        `\`\`\`play\n${fenceJson}\n\`\`\``,
    };
  },
};

const place_defense: CoachAiTool = {
  def: {
    name: "place_defense",
    description:
      "Get canonical defender positions for a named (front, coverage) combination. " +
      "ALWAYS call this BEFORE drawing defense in any play diagram — freehanding " +
      "defense produces broken looks (two CBs same side, LBs stacked on D-line, " +
      "safeties at QB depth). Pick a real scheme and let this tool place the players. " +
      "Returns a `players` array in the same {id, x, y} format as the diagram's " +
      "players list — drop them straight in with team:\"D\". " +
      "If the (front, coverage) combo isn't in the catalog, the tool returns the " +
      "list of available combos for the variant; pick the closest match and call again.",
    input_schema: {
      type: "object",
      properties: {
        front: {
          type: "string",
          description:
            "Defensive front name as a coach would say it. " +
            "Examples: \"4-3 Over\", \"3-4\", \"46 Bear\", \"Nickel (4-2-5)\", \"7v7 Zone\", \"5v5 Man\".",
        },
        coverage: {
          type: "string",
          description:
            "Coverage name. Examples: \"Cover 1\", \"Cover 2\", \"Cover 3\", \"Cover 4 (Quarters)\".",
        },
        strength: {
          type: "string",
          enum: ["left", "right"],
          description:
            "Which side the offensive strength (TE, trips, etc.) is on. The defense rotates toward strength. Default \"right\".",
        },
      },
      required: ["front", "coverage"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const front = typeof input.front === "string" ? input.front.trim() : "";
    const coverage = typeof input.coverage === "string" ? input.coverage.trim() : "";
    if (!front || !coverage) return { ok: false, error: "front and coverage are required." };
    const strength: "left" | "right" =
      input.strength === "left" ? "left" : "right";

    const variant = ctx.sportVariant ?? "flag_7v7";
    const alignment = computeDefenseAlignment(variant, front, coverage, strength);
    if (!alignment.ok) return alignment;

    // Suffix duplicate role labels so every player has a unique diagram
    // id (two DTs → DT, DT2; two CBs → CB, CB2). The diagram-level
    // schema rejects duplicate ids; emitting them here produces the
    // "Duplicate player id 'DT'" error coaches saw on Cover 3.
    const seenIds = new Map<string, number>();
    const uniquePlayers = alignment.players.map((p) => {
      const count = (seenIds.get(p.id) ?? 0) + 1;
      seenIds.set(p.id, count);
      const id = count === 1 ? p.id : `${p.id}${count}`;
      return { id, role: p.id, x: p.x, y: p.y };
    });
    const playersJson = JSON.stringify(
      uniquePlayers.map((p) => ({ id: p.id, role: p.role, x: p.x, y: p.y, team: "D" })),
    );

    const isMan = alignment.manCoverage;
    // Emit only zones that have a defender actually dropping into them
    // (alignment.zones already carries `ownerLabel` from the catalog).
    // Cover 1 keeps the FS deep-middle zone; Cover 0 emits none.
    const zones = alignment.zones.filter((z) => z.ownerLabel);
    const zonesJson = JSON.stringify(zones);

    // Per-defender assignment breakdown — surfaced so Cal can narrate
    // each defender's role, not just position them. This is what lets
    // Cal answer "show their zones?" on Cover 1 with the correct
    // mixed-coverage answer (FS deep middle zone + everyone else man)
    // instead of either "all zone" or "all man". Use the suffixed id
    // (DT vs DT2) so the breakdown matches the players[] above.
    const assignmentBreakdown = alignment.players
      .map((p, i) => {
        const uid = uniquePlayers[i].id;
        const a = p.assignment;
        if (!a) return `  ${uid}: (catalog default — likely man)`;
        switch (a.kind) {
          case "zone":  return `  ${uid}: zone drop → ${a.zoneId}`;
          case "man":   return `  ${uid}: man on ${a.target ?? "receiver (by leverage)"}`;
          case "blitz": return `  ${uid}: blitz ${a.gap ?? "A"}-gap`;
          case "spy":   return `  ${uid}: spy ${a.target ?? "QB"}`;
        }
      })
      .join("\n");

    const lines: string[] = [
      `${alignment.synthesized ? "Synthesized" : "Canonical"} "${alignment.front} / ${alignment.coverage}" (${alignment.variant}, strength=${strength}):`,
      alignment.description,
      "",
      `Per-defender assignments:\n${assignmentBreakdown}`,
      "",
      `Drop these players into your diagram (team:"D"):`,
      playersJson,
    ];
    if (isMan && zones.length === 0) {
      lines.push(
        "",
        "PURE MAN COVERAGE: no zones drawn. Draw an assignment line (a " +
        "route from each defender to the receiver they're matched on) so " +
        "the coach can see who has whom. Use a small startDelaySec " +
        "(~0.1-0.3s) on each defender route so they react to the snap.",
      );
    } else if (zones.length > 0 && isMan) {
      lines.push(
        "",
        "MIXED COVERAGE (e.g. Cover 1 robber): draw the zone(s) for " +
        "zone defenders AND man-assignment lines for the rest. Both go " +
        "into the same diagram. The per-defender breakdown above tells " +
        "you who's in zone vs. man.",
        "",
        "Zones for this coverage (drop into your diagram's `zones` field):",
        zonesJson,
      );
    } else {
      lines.push(
        "",
        "Zones for this coverage (drop into your diagram's `zones` field):",
        zonesJson,
      );
    }
    return { ok: true, result: lines.join("\n") };
  },
};

const place_offense: CoachAiTool = {
  def: {
    name: "place_offense",
    description:
      "Get canonical OFFENSIVE starting alignment for a named formation. " +
      "ALWAYS call this BEFORE drawing offense in any play diagram — freehanding " +
      "the formation produces broken looks (Pro I labeled as Spread, players " +
      "stacked at the same coordinate, missing OL, etc.). The synthesizer " +
      "handles common formation names and falls back to Spread Doubles when " +
      "the coach is vague. " +
      "Returns a `players` array in the same {id, x, y} format as the diagram's " +
      "players list — drop them straight in with team:\"O\". " +
      "Recognized formation names (case-insensitive): Spread, Empty / 5-wide, " +
      "Trips (with optional 'Right'/'Left'), Doubles / 2x2, Twins, Bunch, Stack, " +
      "Pro I / I-form, Pro Set / Split-back, Singleback / Ace, Pistol, Wishbone, " +
      "T-formation / Full House, Shotgun. Strength side parsed from " +
      "'right'/'left'/'strong'/'weak' if present.",
    input_schema: {
      type: "object",
      properties: {
        formation: {
          type: "string",
          description:
            "Formation name as the coach said it. Examples: \"Spread Doubles\", " +
            "\"Trips Right\", \"Pro I Strong Left\", \"Empty\", \"Pistol\", " +
            "\"Wishbone\".",
        },
      },
      required: ["formation"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const formation = typeof input.formation === "string" ? input.formation.trim() : "";
    if (!formation) return { ok: false, error: "formation is required." };

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { synthesizeOffense, synthesizeOffenseFallback } = require("@/domain/play/offensiveSynthesize") as typeof import("@/domain/play/offensiveSynthesize");

    const variant = ctx.sportVariant ?? "flag_7v7";
    const synth = synthesizeOffense(variant, formation) ?? synthesizeOffenseFallback(variant);
    if (!synth) {
      return {
        ok: false,
        error:
          `No offensive synthesizer available for variant "${variant}". ` +
          `Place offense by hand using the prompt's formation legality rules.`,
      };
    }

    const playersJson = JSON.stringify(
      synth.players.map((p) => ({ id: p.id, x: p.x, y: p.y, team: "O" })),
    );

    const lines: string[] = [
      `${synth.exactMatch ? "Synthesized" : "Synthesized (fallback to Spread Doubles)"} "${synth.formation}" (${synth.variant}):`,
      synth.description,
      "",
      `Drop these players into your diagram (team:"O"):`,
      playersJson,
    ];
    if (!synth.exactMatch) {
      lines.push(
        "",
        "NOTE: I couldn't pin down the formation from the name, so I drew a " +
        "default Spread Doubles. Mention this in your reply so the coach can " +
        "correct you (\"Drew Spread Doubles by default — let me know if you " +
        "meant something else.\").",
      );
    }
    return { ok: true, result: lines.join("\n") };
  },
};

const create_playbook: CoachAiTool = {
  def: {
    name: "create_playbook",
    description:
      "Create a brand-new playbook in the current user's account. Use this when the coach asks " +
      "you to make/start/build a new playbook. Only call AFTER summarizing the proposed name, " +
      "sport variant, and season back to the coach and receiving explicit confirmation " +
      "(\"yes\", \"go\", \"create it\"). Never call on a vague \"ok\". The result includes a URL the coach can follow.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Playbook name. 1-80 chars. Required." },
        sport_variant: {
          type: "string",
          enum: ["flag_5v5", "flag_7v7", "tackle_11", "other"],
          description: "Sport variant. flag_7v7 (default) | flag_5v5 | tackle_11 | other (custom 4-11 player count, requires custom_offense_count).",
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
          description:
            "Hex color like #RRGGBB for the playbook's accent. STRONGLY RECOMMENDED — uncolored playbooks render with an inconsistent fallback on the dashboard cover. Pick something that matches the team if known, otherwise a default like #134e2a.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  async handler(input) {
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    if (!name) return { ok: false, error: "Playbook name is required." };
    const allowedVariants = ["flag_5v5", "flag_7v7", "tackle_11", "other"] as const;
    type Variant = (typeof allowedVariants)[number];
    const variantRaw = typeof input.sport_variant === "string" ? input.sport_variant : "flag_7v7";
    const sportVariant: Variant = (allowedVariants as readonly string[]).includes(variantRaw)
      ? (variantRaw as Variant)
      : "flag_7v7";
    const season = typeof input.season === "string" ? input.season : null;
    const color = typeof input.color === "string" ? input.color : null;
    const customOffenseCount =
      typeof input.custom_offense_count === "number" ? Math.round(input.custom_offense_count) : null;

    try {
      // Call the shared helper directly. Going through createPlaybookAction
      // via require() in Next.js 16 / Turbopack returned a stub that didn't
      // execute the insert — Cal would say "Playbook created!" with a
      // working-looking link, but no row was ever written.
      const { createClient } = await import("@/lib/supabase/server");
      const { createPlaybookForUser } = await import("@/lib/data/playbook-create");
      const supabase = await createClient();
      const res = await createPlaybookForUser(supabase, {
        name,
        sportVariant,
        color: color,
        customOffenseCount,
        season,
      });
      if (!res.ok) return { ok: false, error: res.error };
      const url = `/playbooks/${res.id}`;
      return {
        ok: true,
        result:
          `Created playbook "${name}" (${sportVariant}), id=${res.id}. Tell the coach it's ready and link them: ` +
          `[Open ${name}](${url}). Then offer to start designing plays or scheduling.`,
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
      "asks to add/schedule/book practices or games. Only call AFTER summarizing the proposed " +
      "title/type/start/duration/recurrence back to the coach and getting an explicit yes. " +
      "Convert natural language like \"every Mon and Wed at 5pm\" into a concrete ISO 8601 startsAt " +
      "(the first occurrence) plus an iCal RRULE for recurrence. " +
      "**Type selection — match the event's true nature, not the title's wording:** " +
      "\"game\" for ANY competitive matchup against another team (titles like \"Game vs. X\", \"vs. X\", \"@ X\", \"X scrimmage\" if it counts as a real game); " +
      "\"scrimmage\" only when the coach explicitly calls it a scrimmage; " +
      "\"practice\" for team practices, walkthroughs, or film sessions; " +
      "\"other\" ONLY as a last resort when none of the above fit (team meetings, banquets, picture day). " +
      "Never default to \"other\" for a matchup against a named opponent — that's always \"game\".",
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
      // Resolve the actual weekday from the saved start time so Cal can echo
      // the truth back to the coach instead of hallucinating a day-of-week
      // from the date (Claude is unreliable at calendar arithmetic).
      let resolved = startsAt;
      try {
        const d = new Date(startsAt);
        if (!Number.isNaN(d.getTime())) {
          resolved = d.toLocaleString("en-US", {
            timeZone: timezone,
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          });
        }
      } catch { /* fall back to raw startsAt */ }
      return {
        ok: true,
        result:
          `Scheduled "${title}" for ${resolved}${recurNote}. Use this exact date+weekday verbatim when you tell the coach (do NOT recompute the day-of-week yourself). Link them to the calendar: [Open calendar](${url}).`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "create_event failed";
      return { ok: false, error: msg };
    }
  },
};

const list_events: CoachAiTool = {
  def: {
    name: "list_events",
    description:
      "List the events (practices, games, scrimmages, other) on the current playbook's calendar. " +
      "Call this whenever the coach asks about existing events — e.g. \"when's our next practice\", " +
      "\"reschedule Wednesday's practice\", \"cancel the game on the 15th\", \"move all practices to Tuesdays\". " +
      "Returns parent rows (one per series — recurring events are NOT expanded), each with the iCal RRULE so " +
      "you can reason about which weekdays a series lands on (e.g. RRULE containing BYDAY=WE means Wednesdays). " +
      "Requires the chat to be anchored to a playbook.",
    input_schema: {
      type: "object",
      properties: {
        includePast: {
          type: "boolean",
          description: "Include events whose first occurrence is already in the past. Default false (upcoming only).",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) {
      return { ok: false, error: "Open a playbook first — events live on a specific playbook." };
    }
    const includePast = input.includePast === true;
    try {
      const supabase = await createClient();
      let q = supabase
        .from("playbook_events")
        .select(
          "id, type, title, starts_at, duration_minutes, timezone, recurrence_rule, location_name, location_address, opponent, home_away, notes",
        )
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .order("starts_at", { ascending: true });
      if (!includePast) {
        // Cheap upper bound: hide series whose first occurrence is more than
        // 30 days behind us AND that don't recur. Recurring series may still
        // have upcoming occurrences even if starts_at is old.
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        q = q.or(`starts_at.gte.${cutoff},recurrence_rule.not.is.null`);
      }
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      if (!data || data.length === 0) {
        return { ok: true, result: "No events on this playbook's calendar yet." };
      }
      type Row = {
        id: string;
        type: string;
        title: string;
        starts_at: string;
        duration_minutes: number;
        timezone: string;
        recurrence_rule: string | null;
        location_name: string | null;
        location_address: string | null;
        opponent: string | null;
        home_away: string | null;
        notes: string | null;
      };
      const rows = data as Row[];
      const lines = rows.map((r) => {
        let starts = r.starts_at;
        try {
          const d = new Date(r.starts_at);
          if (!Number.isNaN(d.getTime())) {
            starts = d.toLocaleString("en-US", {
              timeZone: r.timezone || "America/Chicago",
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            });
          }
        } catch { /* keep raw */ }
        const parts: string[] = [];
        parts.push(`id: ${r.id}`);
        parts.push(`type: ${r.type}`);
        parts.push(`title: ${r.title}`);
        parts.push(`first occurrence: ${starts} (raw: ${r.starts_at})`);
        parts.push(`duration: ${r.duration_minutes} min`);
        parts.push(`timezone: ${r.timezone}`);
        if (r.recurrence_rule) parts.push(`recurrence: ${r.recurrence_rule}`);
        if (r.location_name) {
          parts.push(`location: ${r.location_name}${r.location_address ? ` — ${r.location_address}` : ""}`);
        }
        if (r.opponent) parts.push(`opponent: ${r.opponent}${r.home_away ? ` (${r.home_away})` : ""}`);
        if (r.notes) parts.push(`notes: ${r.notes}`);
        return `- ${parts.join(" | ")}`;
      });
      return { ok: true, result: `${rows.length} event(s):\n\n${lines.join("\n")}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "list_events failed";
      return { ok: false, error: msg };
    }
  },
};

// Common shape: optional patch fields used by both update_event and the
// merge step. All fields optional — anything omitted is left as-is.
type EventPatch = {
  type?: string;
  title?: string;
  startsAt?: string;
  durationMinutes?: number;
  arriveMinutesBefore?: number;
  timezone?: string;
  recurrenceRule?: string | null;
  notes?: string | null;
  opponent?: string | null;
  homeAway?: string | null;
  reminderOffsetsMinutes?: number[];
  location?: { name: string; address?: string | null; lat?: number | null; lng?: number | null } | null;
};

function readPatch(input: Record<string, unknown>): EventPatch {
  const patch: EventPatch = {};
  if (typeof input.type === "string") patch.type = input.type;
  if (typeof input.title === "string") patch.title = input.title;
  if (typeof input.startsAt === "string") patch.startsAt = input.startsAt;
  if (typeof input.durationMinutes === "number") patch.durationMinutes = Math.round(input.durationMinutes);
  if (typeof input.arriveMinutesBefore === "number") patch.arriveMinutesBefore = Math.round(input.arriveMinutesBefore);
  if (typeof input.timezone === "string") patch.timezone = input.timezone;
  if (typeof input.recurrenceRule === "string" || input.recurrenceRule === null) {
    patch.recurrenceRule = input.recurrenceRule as string | null;
  }
  if (typeof input.notes === "string" || input.notes === null) patch.notes = input.notes as string | null;
  if (typeof input.opponent === "string" || input.opponent === null) patch.opponent = input.opponent as string | null;
  if (typeof input.homeAway === "string" || input.homeAway === null) patch.homeAway = input.homeAway as string | null;
  if (Array.isArray(input.reminderOffsetsMinutes)) {
    patch.reminderOffsetsMinutes = (input.reminderOffsetsMinutes as unknown[])
      .filter((n): n is number => typeof n === "number")
      .map(Math.round);
  }
  if (input.location !== undefined) {
    const raw = input.location as { name?: unknown; address?: unknown } | null;
    patch.location = raw && typeof raw.name === "string"
      ? {
          name: raw.name,
          address: typeof raw.address === "string" ? raw.address : null,
          lat: null,
          lng: null,
        }
      : null;
  }
  return patch;
}

const PATCH_SCHEMA_PROPERTIES = {
  type: { type: "string", enum: ["practice", "game", "scrimmage", "other"] },
  title: { type: "string" },
  startsAt: {
    type: "string",
    description: "ISO 8601 datetime WITH offset for the FIRST occurrence (e.g. \"2026-05-04T17:00:00-05:00\"). For recurring series this rewrites the series anchor.",
  },
  durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
  arriveMinutesBefore: { type: "integer", minimum: 0, maximum: 480 },
  timezone: { type: "string", description: "IANA tz name." },
  recurrenceRule: {
    type: ["string", "null"],
    description: "iCal RRULE for recurring events (e.g. \"FREQ=WEEKLY;BYDAY=TU\"). Pass null to convert a recurring event to a one-off.",
  },
  location: {
    type: ["object", "null"],
    properties: {
      name: { type: "string" },
      address: { type: "string" },
    },
    required: ["name"],
    additionalProperties: false,
  },
  notes: { type: ["string", "null"] },
  opponent: { type: ["string", "null"] },
  homeAway: { type: ["string", "null"], enum: ["home", "away", "neutral", null] },
  reminderOffsetsMinutes: {
    type: "array",
    items: { type: "integer", minimum: 0, maximum: 20160 },
    maxItems: 8,
  },
} as const;

const update_event: CoachAiTool = {
  def: {
    name: "update_event",
    description:
      "Reschedule or edit an existing calendar event. Pass `eventId` (from list_events) plus only the fields " +
      "you want to change — anything you omit is preserved. " +
      "RECURRING SERIES: pick `scope` to control which occurrences change: " +
      "  - \"all\" (default): rewrite the whole series. Use this when the coach says \"move all practices to Tuesdays\". " +
      "  - \"following\": split the series at `occurrenceDate`. Past occurrences stay on the old schedule, this one and future ones move. " +
      "  - \"this\": change only the single occurrence on `occurrenceDate` (creates a one-off override). " +
      "When `scope` is \"this\" or \"following\", `occurrenceDate` is REQUIRED in YYYY-MM-DD form. " +
      "ALWAYS summarize the proposed change back to the coach in plain English (\"move 'Practice' from Wednesdays to Tuesdays at 6pm — sound right?\") and wait for explicit yes before calling. " +
      "To shift Wednesday → Tuesday, change the BYDAY in `recurrenceRule` (e.g. BYDAY=WE → BYDAY=TU) AND advance `startsAt` to the matching Tuesday at the same time. " +
      "Requires that the chat is anchored to a playbook the coach can edit.",
    input_schema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event id from list_events." },
        scope: {
          type: "string",
          enum: ["this", "following", "all"],
          description: "Recurrence scope. Default \"all\". For non-recurring events, any value is treated as \"all\".",
        },
        occurrenceDate: {
          type: "string",
          description: "YYYY-MM-DD of the specific occurrence being edited. Required when scope is \"this\" or \"following\".",
        },
        notifyAttendees: {
          type: "boolean",
          description: "Send an \"event edited\" email/notification to playbook members. Default true.",
        },
        ...PATCH_SCHEMA_PROPERTIES,
      },
      required: ["eventId"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) {
      return { ok: false, error: "Open a playbook first — events live on a specific playbook." };
    }
    if (!ctx.canEditPlaybook) {
      return { ok: false, error: "Only coaches who can edit this playbook can reschedule events." };
    }
    const eventId = typeof input.eventId === "string" ? input.eventId : "";
    if (!eventId) return { ok: false, error: "eventId is required (call list_events first)." };
    const scope = (typeof input.scope === "string" && ["this", "following", "all"].includes(input.scope))
      ? (input.scope as "this" | "following" | "all")
      : "all";
    const occurrenceDate = typeof input.occurrenceDate === "string" ? input.occurrenceDate : null;
    if ((scope === "this" || scope === "following") && !occurrenceDate) {
      return { ok: false, error: "occurrenceDate (YYYY-MM-DD) is required when scope is \"this\" or \"following\"." };
    }
    const notifyAttendees = input.notifyAttendees !== false; // default true

    try {
      const supabase = await createClient();
      const { data: existing, error: readErr } = await supabase
        .from("playbook_events")
        .select(
          "playbook_id, type, title, starts_at, duration_minutes, arrive_minutes_before, timezone, recurrence_rule, location_name, location_address, location_lat, location_lng, notes, opponent, home_away, reminder_offsets_minutes",
        )
        .eq("id", eventId)
        .is("deleted_at", null)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      if (!existing) return { ok: false, error: "Event not found (already deleted, or wrong id)." };
      if (existing.playbook_id !== ctx.playbookId) {
        return { ok: false, error: "That event belongs to a different playbook." };
      }

      const patch = readPatch(input);
      const merged = {
        type: patch.type ?? (existing.type as string),
        title: patch.title ?? (existing.title as string),
        startsAt: patch.startsAt ?? (existing.starts_at as string),
        durationMinutes: patch.durationMinutes ?? (existing.duration_minutes as number),
        arriveMinutesBefore: patch.arriveMinutesBefore ?? (existing.arrive_minutes_before as number),
        timezone: patch.timezone ?? (existing.timezone as string),
        recurrenceRule: patch.recurrenceRule !== undefined ? patch.recurrenceRule : (existing.recurrence_rule as string | null),
        notes: patch.notes !== undefined ? patch.notes : (existing.notes as string | null),
        opponent: patch.opponent !== undefined ? patch.opponent : (existing.opponent as string | null),
        homeAway: patch.homeAway !== undefined ? patch.homeAway as "home" | "away" | "neutral" | null : (existing.home_away as "home" | "away" | "neutral" | null),
        reminderOffsetsMinutes: patch.reminderOffsetsMinutes ?? ((existing.reminder_offsets_minutes as number[] | null) ?? []),
        location: patch.location !== undefined
          ? patch.location
          : existing.location_name
            ? {
                name: existing.location_name as string,
                address: (existing.location_address as string | null) ?? null,
                lat: (existing.location_lat as number | null) ?? null,
                lng: (existing.location_lng as number | null) ?? null,
              }
            : null,
        notifyAttendees,
      };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { updateEventAction, updateEventOccurrenceAction } =
        require("@/app/actions/calendar") as typeof import("@/app/actions/calendar");

      let res: { ok: true } | { ok: false; error: string };
      if (scope === "all" || !existing.recurrence_rule) {
        res = await updateEventAction(eventId, merged);
      } else {
        res = await updateEventOccurrenceAction(eventId, { ...merged, scope, occurrenceDate });
      }
      if (!res.ok) return { ok: false, error: res.error };

      // Resolve the final start string for verbatim echo.
      let resolved = merged.startsAt;
      try {
        const d = new Date(merged.startsAt);
        if (!Number.isNaN(d.getTime())) {
          resolved = d.toLocaleString("en-US", {
            timeZone: merged.timezone,
            weekday: "long", year: "numeric", month: "long", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
          });
        }
      } catch { /* keep raw */ }
      const url = `/playbooks/${ctx.playbookId}?tab=calendar`;
      const recurNote = merged.recurrenceRule ? ` (recurring: ${merged.recurrenceRule})` : "";
      const scopeNote = scope === "all" ? "" : ` — scope: ${scope} occurrence ${occurrenceDate ?? ""}`;
      return {
        ok: true,
        result:
          `Updated "${merged.title}" — now ${resolved}${recurNote}${scopeNote}. ` +
          `Use this exact date+weekday verbatim when telling the coach (do NOT recompute). ` +
          `Link them to the calendar: [Open calendar](${url}).`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "update_event failed";
      return { ok: false, error: msg };
    }
  },
};

const cancel_event: CoachAiTool = {
  def: {
    name: "cancel_event",
    description:
      "Cancel/delete a calendar event. Pass `eventId` (from list_events). " +
      "RECURRING SERIES: pick `scope`: " +
      "  - \"all\": cancel the whole series. " +
      "  - \"following\": end the series just before `occurrenceDate` (this occurrence and all future ones go away). " +
      "  - \"this\": cancel only the single occurrence on `occurrenceDate`. " +
      "When scope is \"this\" or \"following\", `occurrenceDate` (YYYY-MM-DD) is REQUIRED. " +
      "ALWAYS confirm with the coach in plain English before calling. " +
      "Requires that the chat is anchored to a playbook the coach can edit.",
    input_schema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event id from list_events." },
        scope: {
          type: "string",
          enum: ["this", "following", "all"],
          description: "Recurrence scope. Default \"all\".",
        },
        occurrenceDate: {
          type: "string",
          description: "YYYY-MM-DD of the specific occurrence being cancelled. Required when scope is \"this\" or \"following\".",
        },
        notifyAttendees: {
          type: "boolean",
          description: "Send a \"cancelled\" email/notification to playbook members. Default true.",
        },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) {
      return { ok: false, error: "Open a playbook first — events live on a specific playbook." };
    }
    if (!ctx.canEditPlaybook) {
      return { ok: false, error: "Only coaches who can edit this playbook can cancel events." };
    }
    const eventId = typeof input.eventId === "string" ? input.eventId : "";
    if (!eventId) return { ok: false, error: "eventId is required (call list_events first)." };
    const scope = (typeof input.scope === "string" && ["this", "following", "all"].includes(input.scope))
      ? (input.scope as "this" | "following" | "all")
      : "all";
    const occurrenceDate = typeof input.occurrenceDate === "string" ? input.occurrenceDate : null;
    if ((scope === "this" || scope === "following") && !occurrenceDate) {
      return { ok: false, error: "occurrenceDate (YYYY-MM-DD) is required when scope is \"this\" or \"following\"." };
    }
    const notifyAttendees = input.notifyAttendees !== false;

    try {
      const supabase = await createClient();
      const { data: existing, error: readErr } = await supabase
        .from("playbook_events")
        .select("playbook_id, title, recurrence_rule")
        .eq("id", eventId)
        .is("deleted_at", null)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      if (!existing) return { ok: false, error: "Event not found (already deleted, or wrong id)." };
      if (existing.playbook_id !== ctx.playbookId) {
        return { ok: false, error: "That event belongs to a different playbook." };
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { deleteEventAction, deleteEventOccurrenceAction } =
        require("@/app/actions/calendar") as typeof import("@/app/actions/calendar");

      let res: { ok: true } | { ok: false; error: string };
      if (scope === "all" || !existing.recurrence_rule) {
        res = await deleteEventAction(eventId, notifyAttendees);
      } else {
        res = await deleteEventOccurrenceAction(eventId, { scope, occurrenceDate, notifyAttendees });
      }
      if (!res.ok) return { ok: false, error: res.error };

      const url = `/playbooks/${ctx.playbookId}?tab=calendar`;
      const scopeNote =
        scope === "all" ? "the whole series"
        : scope === "following" ? `this occurrence and all future ones (from ${occurrenceDate})`
        : `the occurrence on ${occurrenceDate}`;
      return {
        ok: true,
        result: `Cancelled "${existing.title}" — ${scopeNote}. [Open calendar](${url}).`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "cancel_event failed";
      return { ok: false, error: msg };
    }
  },
};

const rsvp_event: CoachAiTool = {
  def: {
    name: "rsvp_event",
    description:
      "RSVP the CURRENT COACH (the user you're chatting with) to one or more events on the anchored playbook. " +
      "You CANNOT RSVP on behalf of other team members — they manage their own status. " +
      "Common patterns: " +
      "  - Single one-off event: pass `eventId` only (occurrenceDate defaults to the event's date). " +
      "  - Single recurring occurrence: pass `eventId` + `occurrenceDate` (YYYY-MM-DD). " +
      "  - Bulk: pass `allUpcoming: true` to RSVP every upcoming occurrence in this playbook (skips already-started events). " +
      "Status \"clear\" removes the RSVP. " +
      "Past/started occurrences are locked and will be skipped.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["yes", "no", "maybe", "clear"],
          description: "RSVP status to set. \"clear\" removes the RSVP.",
        },
        eventId: { type: "string", description: "Event id from list_events. Required unless allUpcoming is true." },
        occurrenceDate: {
          type: "string",
          description:
            "YYYY-MM-DD of the specific occurrence. For recurring series this is required. " +
            "For one-off events, defaults to the event's start date.",
        },
        allUpcoming: {
          type: "boolean",
          description: "RSVP all upcoming occurrences across every event in the playbook. Default false.",
        },
      },
      required: ["status"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) {
      return { ok: false, error: "Open a playbook first — RSVPs live on a specific playbook's events." };
    }
    const status = typeof input.status === "string" ? input.status : "";
    if (!["yes", "no", "maybe", "clear"].includes(status)) {
      return { ok: false, error: "status must be \"yes\", \"no\", \"maybe\", or \"clear\"." };
    }
    const allUpcoming = input.allUpcoming === true;
    const eventIdInput = typeof input.eventId === "string" ? input.eventId : "";
    const occurrenceDateInput = typeof input.occurrenceDate === "string" ? input.occurrenceDate : null;
    if (!allUpcoming && !eventIdInput) {
      return { ok: false, error: "Pass `eventId` (call list_events first) or set `allUpcoming: true`." };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { setRsvpAction, clearRsvpAction, listEventsForPlaybookAction } =
        require("@/app/actions/calendar") as typeof import("@/app/actions/calendar");

      type Target = { eventId: string; occurrenceDate: string; title: string; startsAt: string };
      const targets: Target[] = [];

      if (allUpcoming) {
        const listed = await listEventsForPlaybookAction(ctx.playbookId);
        if (!listed.ok) return { ok: false, error: listed.error };
        const now = Date.now();
        for (const ev of listed.events) {
          const startMs = new Date(ev.startsAt).getTime();
          if (Number.isNaN(startMs) || startMs <= now) continue;
          targets.push({
            eventId: ev.id,
            occurrenceDate: ev.occurrenceDate,
            title: ev.title,
            startsAt: ev.startsAt,
          });
        }
        if (targets.length === 0) {
          return { ok: true, result: "No upcoming events to RSVP to on this playbook." };
        }
      } else {
        // Resolve occurrenceDate for a single event. For one-offs, derive from
        // starts_at (UTC date). For recurring series, require it explicitly.
        const listed = await listEventsForPlaybookAction(ctx.playbookId);
        if (!listed.ok) return { ok: false, error: listed.error };
        const matches = listed.events.filter((ev) => ev.id === eventIdInput);
        if (matches.length === 0) {
          return { ok: false, error: "Event not found on this playbook (call list_events to get current ids)." };
        }
        let target: Target | null = null;
        if (occurrenceDateInput) {
          const exact = matches.find((m) => m.occurrenceDate === occurrenceDateInput);
          if (!exact) {
            return { ok: false, error: `No occurrence on ${occurrenceDateInput} for that event.` };
          }
          target = { eventId: exact.id, occurrenceDate: exact.occurrenceDate, title: exact.title, startsAt: exact.startsAt };
        } else if (matches.length === 1) {
          target = { eventId: matches[0]!.id, occurrenceDate: matches[0]!.occurrenceDate, title: matches[0]!.title, startsAt: matches[0]!.startsAt };
        } else {
          return {
            ok: false,
            error: "This is a recurring series — pass `occurrenceDate` (YYYY-MM-DD) for the specific occurrence.",
          };
        }
        targets.push(target);
      }

      let succeeded = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const t of targets) {
        const res = status === "clear"
          ? await clearRsvpAction(t.eventId, t.occurrenceDate)
          : await setRsvpAction({
              eventId: t.eventId,
              occurrenceDate: t.occurrenceDate,
              status: status as "yes" | "no" | "maybe",
              note: null,
            });
        if (res.ok) {
          succeeded += 1;
        } else if (/locked/i.test(res.error)) {
          skipped += 1;
        } else {
          errors.push(`${t.title} (${t.occurrenceDate}): ${res.error}`);
        }
      }

      const url = `/playbooks/${ctx.playbookId}?tab=calendar`;
      const verb = status === "clear" ? "Cleared RSVP for" : `RSVPed "${status}" to`;
      const parts: string[] = [];
      if (succeeded > 0) parts.push(`${verb} ${succeeded} event${succeeded === 1 ? "" : "s"}`);
      if (skipped > 0) parts.push(`skipped ${skipped} that already started`);
      if (errors.length > 0) parts.push(`failed: ${errors.join("; ")}`);
      const summary = parts.length > 0 ? parts.join("; ") : "No changes.";
      return { ok: true, result: `${summary}. [Open calendar](${url}).` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "rsvp_event failed";
      return { ok: false, error: msg };
    }
  },
};

export const BASE_TOOLS: CoachAiTool[] = [search_kb, list_my_playbooks, create_playbook, get_route_template, get_concept_skeleton, compose_play, revise_play, compose_defense, place_defense, place_offense, modify_play_route, add_defense_to_play, set_defender_assignment, flag_outside_kb, flag_refusal];

// Loaded lazily to avoid a circular import (user-preferences imports CoachAiTool).
function userPreferenceTools(): CoachAiTool[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { USER_PREFERENCE_TOOLS } = require("./user-preferences") as typeof import("./user-preferences");
  return USER_PREFERENCE_TOOLS;
}

/** Tools exposed for a given mode/auth combo. */
export function toolsFor(ctx: ToolContext): CoachAiTool[] {
  const tools: CoachAiTool[] = [...BASE_TOOLS, ...userPreferenceTools()];
  if (ctx.mode === "admin_training" && ctx.isAdmin) {
    // Lazy import to avoid cycle at module init.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KB_ADMIN_TOOLS } = require("./kb-tools") as typeof import("./kb-tools");
    tools.push(...KB_ADMIN_TOOLS);
  }
  // Playbook KB curation tools — available whenever the chat is anchored to a
  // playbook the coach can edit. The propose_* tools never write directly;
  // they emit a chip the coach must confirm via the chat UI. So they're safe
  // to expose all the time, regardless of mode.
  if (ctx.canEditPlaybook && ctx.playbookId) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PLAYBOOK_KB_TOOLS } = require("./playbook-tools") as typeof import("./playbook-tools");
    tools.push(...PLAYBOOK_KB_TOOLS);
  }
  if (ctx.playbookId) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PLAY_TOOLS } = require("./play-tools") as typeof import("./play-tools");
    const writeNames = new Set(["update_play", "create_play", "rename_play", "update_play_notes"]);
    const readTools = PLAY_TOOLS.filter((t) => !writeNames.has(t.def.name));
    tools.push(...readTools);
    // Reading the calendar is available to anyone with the playbook anchored.
    tools.push(list_events);
    if (ctx.canEditPlaybook) {
      const writeTools = PLAY_TOOLS.filter((t) => writeNames.has(t.def.name));
      tools.push(...writeTools);
      // Scheduling: only available to coaches who can edit the playbook.
      tools.push(create_event, update_event, cancel_event);
    }
    // RSVP is per-user (the calling coach RSVPs themselves) — available to
    // anyone who can see the playbook, edit permission not required.
    tools.push(rsvp_event);
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
