import { searchKb, type KbFilter } from "./retrieve";
import { createClient } from "@/lib/supabase/server";
import { logCoachAiRefusal, logCoachAiKbMiss } from "./feedback-log";
import type { ToolDef } from "./llm";

export type CoachAiMode = "normal" | "admin_training" | "playbook_training";

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

    return {
      ok: true,
      result:
        `Canonical "${template.name}" (${template.breakStyle} break, ${template.breakDir}) from (${playerX}, ${playerY}) on ${variantLabel}.\n\n` +
        `DEFINITION (use this wording verbatim when explaining the route):\n${template.description}\n\n` +
        `Direction: ${dirLabel}.\n` +
        `path: ${pathJson}\n` +
        `curve: ${curve}\n` +
        `tip: "arrow"\n\n` +
        `Drop into your diagram's "routes" array (copy path AND curve flag exactly):\n${routeJsonFragment}`,
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      findDefensiveAlignment,
      listDefensiveAlignments,
      alignmentForStrength,
      zonesForStrength,
    } = require("@/domain/play/defensiveAlignments") as typeof import("@/domain/play/defensiveAlignments");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { synthesizeAlignment } = require("@/domain/play/defensiveSynthesize") as typeof import("@/domain/play/defensiveSynthesize");

    const variant = ctx.sportVariant ?? "flag_7v7";
    const catalogMatch = findDefensiveAlignment(variant, front, coverage);

    // If the catalog has no exact match, try to synthesize one from the
    // front + coverage names (parses "6-2", "5-3 Stack", etc. into a
    // sensible alignment with the right total count). Only falls back to
    // the "available combos" error when synthesis can't make sense of the
    // request either.
    // Normalize the two zone shapes (catalog uses [number, number] tuples,
    // synthesizer uses {x, y} objects) into a single tuple shape that the
    // diagram converter already understands downstream.
    type ZoneOut = { kind: "rectangle" | "ellipse"; center: [number, number]; size: [number, number]; label: string };
    type AlignmentLike = {
      front: string;
      coverage: string;
      variant: string;
      description: string;
      players: Array<{ id: string; x: number; y: number }>;
      zones: ZoneOut[];
      manCoverage: boolean;
    };

    let alignment: AlignmentLike | null = null;
    let synthesized = false;
    if (catalogMatch) {
      alignment = {
        front: catalogMatch.front,
        coverage: catalogMatch.coverage,
        variant: catalogMatch.variant,
        description: catalogMatch.description,
        players: alignmentForStrength(catalogMatch, strength),
        zones: zonesForStrength(catalogMatch, strength).map((z) => ({
          kind: z.kind,
          center: [z.center[0], z.center[1]] as [number, number],
          size: [z.size[0], z.size[1]] as [number, number],
          label: z.label,
        })),
        manCoverage: catalogMatch.manCoverage === true,
      };
    } else {
      const synth = synthesizeAlignment(variant, front, coverage);
      if (synth) {
        const flip = strength === "left";
        alignment = {
          front: synth.front,
          coverage: synth.coverage,
          variant: synth.variant,
          description: synth.description,
          players: synth.players.map((p) => ({
            id: p.id,
            x: flip ? -p.x : p.x,
            y: p.y,
          })),
          zones: synth.zones.map((z) => ({
            kind: z.kind,
            center: [flip ? -z.center.x : z.center.x, z.center.y] as [number, number],
            size: [z.size.x, z.size.y] as [number, number],
            label: z.label,
          })),
          manCoverage: synth.manCoverage,
        };
        synthesized = true;
      }
    }

    if (!alignment) {
      const available = listDefensiveAlignments(variant);
      if (available.length === 0) {
        return {
          ok: false,
          error:
            `No canonical alignments seeded for variant "${variant}", and the front "${front}" couldn't be parsed as an N-M pattern (e.g., "6-2", "5-3 Stack"). ` +
            `Place defense by hand using the prompt's defender placement rules.`,
        };
      }
      const list = available
        .map((a) => `  - front: "${a.front}", coverage: "${a.coverage}"`)
        .join("\n");
      return {
        ok: false,
        error:
          `No alignment for front="${front}", coverage="${coverage}" on ${variant}, and the front couldn't be parsed as an N-M pattern. ` +
          `Available canonical combos:\n${list}\nCall again with one of these — or pass an N-M front (e.g., "6-2", "5-3") and the synthesizer will place players for you.`,
      };
    }

    const playersJson = JSON.stringify(
      alignment.players.map((p) => ({ id: p.id, x: p.x, y: p.y, team: "D" })),
    );

    const isMan = alignment.manCoverage;
    const zones = isMan ? [] : alignment.zones;
    const zonesJson = JSON.stringify(zones);

    const lines: string[] = [
      `${synthesized ? "Synthesized" : "Canonical"} "${alignment.front} / ${alignment.coverage}" (${alignment.variant}, strength=${strength}):`,
      alignment.description,
      "",
      `Drop these players into your diagram (team:"D"):`,
      playersJson,
    ];
    if (isMan) {
      lines.push(
        "",
        "MAN COVERAGE: do NOT emit zones for this look. Instead, draw an " +
        "assignment line (a route from each defender to the receiver they're " +
        "matched on) so the coach can see who has whom. The animation " +
        "engine will track those routes during playback — set a small " +
        "startDelaySec (~0.1-0.3s) on each defender route so they react to " +
        "the snap rather than moving simultaneously with the offense.",
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

const BASE_TOOLS: CoachAiTool[] = [search_kb, list_my_playbooks, create_playbook, get_route_template, place_defense, flag_outside_kb, flag_refusal];

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
  if (ctx.mode === "playbook_training" && ctx.canEditPlaybook && ctx.playbookId) {
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
