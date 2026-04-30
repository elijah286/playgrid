/**
 * Coach Cal play tools — list_plays, get_play, update_play.
 *
 * These tools are available in normal mode whenever Coach Cal is anchored
 * to a specific playbook (ctx.playbookId !== null).  update_play also
 * requires ctx.canEditPlaybook.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { coachDiagramToPlayDocument, type CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { sportProfileForVariant } from "@/domain/play/factory";
import { recordPlayVersion } from "@/lib/versions/play-version-writer";
import type { PlayDocument, SportVariant } from "@/domain/play/types";
import type { CoachAiTool } from "./tools";

const LOS_Y = 0.4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a play_id input to a canonical UUID.
 *
 * Cal often calls play tools with the slot number ("4") or the name the
 * coach used ("Spread Slant"), not the UUID. Postgres rejects non-UUID
 * strings with `invalid input syntax for type uuid`, which used to surface
 * to the coach as a useless "UUID error". This helper accepts:
 *   - a real UUID — returned as-is after confirming it's in the playbook
 *   - a 1-based slot number ("4", "Play 4") — resolved by sort_order
 *   - an exact play name match — resolved by name
 *   - a fuzzy substring match if the name input matches exactly one play
 *
 * Returns the canonical UUID, or an error string explaining what didn't
 * match.
 */
export async function resolvePlayId(
  rawInput: string,
  playbookId: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const input = rawInput.trim();
  if (!input) return { ok: false, error: "play_id is required." };

  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from("plays")
    .select("id, name, sort_order, group_id")
    .eq("playbook_id", playbookId)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .is("attached_to_play_id", null)
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const plays = (rows ?? []) as Array<{ id: string; name: string; sort_order: number; group_id: string | null }>;
  if (plays.length === 0) return { ok: false, error: "No plays in this playbook." };

  // 1) Direct UUID match.
  if (UUID_RE.test(input)) {
    const hit = plays.find((p) => p.id === input);
    if (hit) return { ok: true, id: hit.id, name: hit.name };
    return { ok: false, error: `No play with id ${input} in this playbook.` };
  }

  // 2) Slot number — "4", "Play 4", "play #4", "#4".
  const numMatch = input.match(/^(?:play\s*)?#?\s*(\d+)$/i);
  if (numMatch) {
    const slot = parseInt(numMatch[1], 10);
    if (slot >= 1 && slot <= plays.length) {
      const hit = plays[slot - 1];
      return { ok: true, id: hit.id, name: hit.name };
    }
    return { ok: false, error: `Slot ${slot} is out of range (playbook has ${plays.length} plays).` };
  }

  // 3) Exact name match (case-insensitive).
  const lower = input.toLowerCase();
  const exact = plays.filter((p) => p.name.toLowerCase() === lower);
  if (exact.length === 1) return { ok: true, id: exact[0].id, name: exact[0].name };
  if (exact.length > 1) {
    return {
      ok: false,
      error: `Multiple plays named "${input}". Use the play's slot number or UUID to disambiguate. Candidates: ${exact.map((p, i) => `slot ${plays.indexOf(p) + 1}`).join(", ")}.`,
    };
  }

  // 4) Fuzzy substring match — accept only if exactly one hit.
  const fuzzy = plays.filter((p) => p.name.toLowerCase().includes(lower));
  if (fuzzy.length === 1) return { ok: true, id: fuzzy[0].id, name: fuzzy[0].name };
  if (fuzzy.length > 1) {
    return {
      ok: false,
      error: `"${input}" matched multiple plays. Use the slot number or full name. Matches: ${fuzzy.map((p) => `"${p.name}" (slot ${plays.indexOf(p) + 1})`).slice(0, 5).join(", ")}.`,
    };
  }

  return { ok: false, error: `No play matched "${input}" — try the slot number (e.g. 4) or exact name.` };
}

/** Convert a saved PlayDocument back into the CoachDiagram yard-based format. */
export function playDocumentToCoachDiagram(doc: PlayDocument, name: string): CoachDiagram {
  const { fieldWidthYds, fieldLengthYds, variant } = doc.sportProfile;

  // Build a stable id per player that's unique within the diagram. Letter
  // labels collide regularly (twins formation, two Zs in 4-wide, etc.) and
  // collapsing both into the same diagram id makes Coach Cal conflate the
  // players — every route attaches to the first one. Suffix duplicates
  // (Z, Z2, Z3) so each player has a distinct handle while the display
  // letter (`role`) stays the original. Single-player cases are unchanged.
  const seen = new Map<string, number>();
  const idByPlayerUuid = new Map<string, string>();
  for (const p of doc.layers.players) {
    const base = p.label || p.id;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    idByPlayerUuid.set(p.id, count === 1 ? base : `${base}${count}`);
  }

  const players = doc.layers.players.map((p) => ({
    id: idByPlayerUuid.get(p.id)!,
    role: p.label || p.role,
    x: Math.round(((p.position.x - 0.5) * fieldWidthYds) * 10) / 10,
    y: Math.round(((p.position.y - LOS_Y) * fieldLengthYds) * 10) / 10,
    team: (p.style.fill === "#DC2626" || p.style.fill === "#B91C1C") ? "D" as const : "O" as const,
    color: p.style.fill,
  }));

  const routes = doc.layers.routes.map((r) => {
    const nodes = r.nodes.slice(1); // skip start node (= player position)
    const path: [number, number][] = nodes.map((n) => [
      Math.round(((n.position.x - 0.5) * fieldWidthYds) * 10) / 10,
      Math.round(((n.position.y - LOS_Y) * fieldLengthYds) * 10) / 10,
    ]);
    const fromLabel = idByPlayerUuid.get(r.carrierPlayerId) ?? r.carrierPlayerId;
    const hasCurve = r.segments.some((s) => s.shape === "curve");
    return {
      from: fromLabel,
      path,
      ...(hasCurve ? { curve: true } : {}),
      tip: (r.endDecoration ?? "arrow") as "arrow" | "t" | "none",
    };
  });

  return {
    title: name,
    variant: variant as string,
    players,
    routes,
  };
}

const list_plays: CoachAiTool = {
  def: {
    name: "list_plays",
    description:
      "List all plays in the current playbook. Returns each play's id, name, " +
      "formation, play type, group, and tags. Call this before get_play to find " +
      "the right play id, or when the coach asks what plays are in the playbook.",
    input_schema: {
      type: "object",
      properties: {
        filter_name: {
          type: "string",
          description: "Optional substring to filter plays by name (case-insensitive).",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    const filter = typeof input.filter_name === "string" ? input.filter_name.toLowerCase() : null;

    try {
      const admin = createServiceRoleClient();
      // Ordered by sort_order so the slot number Cal sees matches the order
      // the coach sees in the playbook UI. (Previously sorted by name, which
      // misaligned "Play 4" between Cal and the coach.)
      const { data, error } = await admin
        .from("plays")
        .select("id, name, formation_name, play_type, group_id, sort_order, tags, is_archived")
        .eq("playbook_id", ctx.playbookId)
        .eq("is_archived", false)
        .is("deleted_at", null)
        .is("attached_to_play_id", null)
        .order("sort_order", { ascending: true });

      if (error) return { ok: false, error: error.message };
      if (!data || data.length === 0) return { ok: true, result: "No plays found in this playbook." };

      const allRows = data as Array<{
        id: string;
        name: string;
        formation_name: string | null;
        play_type: string | null;
        group_id: string | null;
        sort_order: number;
        tags: string[] | null;
        is_archived: boolean;
      }>;

      // Tag every row with its 1-based slot in the FULL ordered list. We do
      // this BEFORE filtering so the slot number reflects what the coach sees.
      const slotById = new Map<string, number>();
      allRows.forEach((r, i) => slotById.set(r.id, i + 1));

      const rows = filter
        ? allRows.filter((r) => r.name.toLowerCase().includes(filter))
        : allRows;

      if (rows.length === 0) return { ok: true, result: `No plays match "${input.filter_name}".` };

      const lines = rows.map((r) => {
        const slot = slotById.get(r.id);
        const slotLabel = slot != null ? `Play ${slot}` : "Play ?";
        const meta = [
          r.play_type ?? "offense",
          r.formation_name ? `formation: ${r.formation_name}` : null,
          r.tags && r.tags.length > 0 ? `tags: ${r.tags.join(", ")}` : null,
        ].filter(Boolean).join(" | ");
        return `• ${slotLabel} — "${r.name}" [${r.id}] (${meta})`;
      });
      return {
        ok: true,
        result:
          `${rows.length} play(s) in playbook display order. Slot numbers match what the coach sees in the UI — when calling other play tools (get_play, rename_play, etc.), you can pass the slot number ("4"), the exact name, or the UUID:\n${lines.join("\n")}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_plays failed" };
    }
  },
};

const get_play: CoachAiTool = {
  def: {
    name: "get_play",
    description:
      "Get the full diagram for a specific play in the current playbook. " +
      "Returns a CoachDiagram JSON with players (positions, colors) and routes. " +
      "Accepts UUID, slot number (\"4\" or \"Play 4\"), or exact play name.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description:
            "UUID, slot number (\"4\"), or exact name of the play to retrieve. " +
            "Slot numbers are 1-based and match the playbook display order.",
        },
      },
      required: ["play_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, playbook_id, current_version_id, formation_name, play_type, tags")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .is("attached_to_play_id", null)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: `Play not found or not in this playbook.` };

      const versionId = play.current_version_id as string | null;
      if (!versionId) return { ok: false, error: "Play has no saved version yet." };

      const { data: version, error: vErr } = await admin
        .from("play_versions")
        .select("document")
        .eq("id", versionId)
        .maybeSingle();

      if (vErr || !version?.document) return { ok: false, error: "Could not load play document." };

      const doc = version.document as PlayDocument;
      const diagram = playDocumentToCoachDiagram(doc, play.name as string);

      const meta = [
        play.formation_name ? `formation: ${play.formation_name}` : null,
        play.play_type ? `type: ${play.play_type}` : null,
        Array.isArray(play.tags) && play.tags.length > 0 ? `tags: ${(play.tags as string[]).join(", ")}` : null,
      ].filter(Boolean).join(" | ");

      return {
        ok: true,
        result: `Play: "${play.name}" (${meta || "no metadata"})\n\n\`\`\`json\n${JSON.stringify(diagram, null, 2)}\n\`\`\``,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "get_play failed" };
    }
  },
};

const update_play: CoachAiTool = {
  def: {
    name: "update_play",
    description:
      "Save an updated diagram to an existing play in the current playbook. " +
      "IMPORTANT: Always confirm with the coach before calling this — show them " +
      "what you plan to change and wait for an explicit 'yes' or 'go ahead'.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, slot number (\"4\"), or exact name of the play to update.",
        },
        diagram: {
          type: "object",
          description:
            "CoachDiagram JSON — same format as diagrams rendered in chat. " +
            "Must include players array. Routes are optional.",
        },
        note: {
          type: "string",
          description: "Short edit note for the version history (1-2 sentences).",
        },
      },
      required: ["play_id", "diagram"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    let diagram: CoachDiagram;
    try {
      diagram = input.diagram as CoachDiagram;
      if (!Array.isArray(diagram?.players)) throw new Error("diagram.players must be an array");
    } catch (e) {
      return { ok: false, error: `Invalid diagram: ${e instanceof Error ? e.message : "bad format"}` };
    }

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, playbook_id, current_version_id, sport_variant")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .is("attached_to_play_id", null)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: "Play not found or not in this playbook." };

      // Resolve variant from playbook (authoritative) or diagram hint
      const resolvedVariant = (ctx.sportVariant ?? play.sport_variant ?? diagram.variant ?? "flag_7v7") as SportVariant;
      const diagramWithVariant: CoachDiagram = { ...diagram, variant: resolvedVariant };
      const newDoc = coachDiagramToPlayDocument(diagramWithVariant);

      // Carry over existing metadata (notes, coachName) from the parent version
      const parentId = play.current_version_id as string | null;
      if (parentId) {
        const { data: parent } = await admin
          .from("play_versions")
          .select("document")
          .eq("id", parentId)
          .maybeSingle();
        const parentDoc = parent?.document as PlayDocument | null;
        if (parentDoc?.metadata) {
          newDoc.metadata = {
            ...parentDoc.metadata,
            coachName: diagram.title ?? parentDoc.metadata.coachName ?? (play.name as string),
            formation: diagram.title ?? parentDoc.metadata.formation ?? "",
          };
        }
      }

      // Get the caller's user id from the active session
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const versionResult = await recordPlayVersion({
        supabase: admin,
        playId,
        document: newDoc,
        parentVersionId: parentId,
        userId: user.id,
        kind: "edit",
        note: typeof input.note === "string" ? input.note : "Edited by Coach Cal",
      });

      if (!versionResult.ok) return { ok: false, error: versionResult.error };
      if (versionResult.deduped) {
        return { ok: true, result: "No changes detected — play is already up to date." };
      }

      // Update current_version_id on the play
      const { error: upErr } = await admin
        .from("plays")
        .update({ current_version_id: versionResult.versionId, updated_at: new Date().toISOString() })
        .eq("id", playId);

      if (upErr) return { ok: false, error: upErr.message };

      return {
        ok: true,
        result: `Play "${play.name}" updated successfully (version ${versionResult.versionId.slice(0, 8)}).`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "update_play failed" };
    }
  },
};

const create_play: CoachAiTool = {
  def: {
    name: "create_play",
    description:
      "Create a brand-new play in the current playbook. Use this when the coach asks " +
      "you to make/add/build a new play (or accepts your offer to do so). Requires " +
      "edit access to the playbook. Always confirm name + diagram with the coach " +
      "before calling — show them the play diagram and wait for an explicit 'yes'.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Play name. 1-80 chars. Required." },
        diagram: {
          type: "object",
          description:
            "CoachDiagram JSON — same format as diagrams rendered in chat. Must include " +
            "a players array with at least the offensive personnel. Routes are optional " +
            "(formation-only plays are valid).",
        },
        formation_name: {
          type: "string",
          description: "Optional formation label (e.g. \"Trips Right\", \"Spread\"). ≤60 chars.",
        },
        play_type: {
          type: "string",
          enum: ["offense", "defense", "special_teams"],
          description: "Play type. Defaults to \"offense\".",
        },
        note: {
          type: "string",
          description: "Optional short note recorded on the initial version (1-2 sentences).",
        },
      },
      required: ["name", "diagram"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    if (!name) return { ok: false, error: "Play name is required." };

    let diagram: CoachDiagram;
    try {
      diagram = input.diagram as CoachDiagram;
      if (!Array.isArray(diagram?.players)) throw new Error("diagram.players must be an array");
    } catch (e) {
      return { ok: false, error: `Invalid diagram: ${e instanceof Error ? e.message : "bad format"}` };
    }

    const playType = (typeof input.play_type === "string" && ["offense", "defense", "special_teams"].includes(input.play_type)
      ? input.play_type
      : "offense") as "offense" | "defense" | "special_teams";
    const formationName = typeof input.formation_name === "string" ? input.formation_name.slice(0, 60) : undefined;

    const resolvedVariant = (ctx.sportVariant ?? diagram.variant ?? "flag_7v7") as SportVariant;

    try {
      // Create the play (empty, with default players for the variant — we'll
      // overwrite with the diagram in the next step).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createPlayAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
      const createRes = await createPlayAction(ctx.playbookId, {
        playName: name,
        playType,
        formationName,
        variant: resolvedVariant,
      });
      if (!createRes.ok) return { ok: false, error: createRes.error };

      // Now save the diagram as a new version on the freshly created play.
      const diagramWithVariant: CoachDiagram = { ...diagram, variant: resolvedVariant, title: diagram.title ?? name };
      const newDoc = coachDiagramToPlayDocument(diagramWithVariant);
      newDoc.metadata.coachName = name;
      if (formationName) newDoc.metadata.formation = formationName;
      newDoc.metadata.playType = playType;

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const admin = createServiceRoleClient();
      const versionResult = await recordPlayVersion({
        supabase: admin,
        playId: createRes.playId,
        document: newDoc,
        parentVersionId: createRes.versionId,
        userId: user.id,
        kind: "edit",
        note: typeof input.note === "string" ? input.note : "Created by Coach Cal",
      });
      if (!versionResult.ok) return { ok: false, error: versionResult.error };

      const finalVersionId = versionResult.deduped ? createRes.versionId : versionResult.versionId;
      if (!versionResult.deduped) {
        const { error: upErr } = await admin
          .from("plays")
          .update({ current_version_id: finalVersionId, updated_at: new Date().toISOString() })
          .eq("id", createRes.playId);
        if (upErr) return { ok: false, error: upErr.message };
      }

      const url = `/plays/${createRes.playId}/edit`;
      return {
        ok: true,
        result:
          `Created play "${name}" in the current playbook. Tell the coach it's ready and link them: ` +
          `[Open ${name}](${url}).`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "create_play failed" };
    }
  },
};

const rename_play: CoachAiTool = {
  def: {
    name: "rename_play",
    description:
      "Rename an existing play in the current playbook. Use this when the coach " +
      "asks you to rename, retitle, or relabel a play — do NOT try to do it via " +
      "update_play (that one only edits the diagram). " +
      "ALWAYS confirm the new name with the coach before calling. " +
      "Requires edit access to the playbook.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, slot number (\"4\"), or exact name of the play to rename.",
        },
        new_name: { type: "string", description: "The new play name. 1-80 chars, trimmed." },
      },
      required: ["play_id", "new_name"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const newName = typeof input.new_name === "string" ? input.new_name.trim() : "";
    if (!newName) return { ok: false, error: "new_name can't be empty." };
    if (newName.length > 80) return { ok: false, error: "new_name must be 80 characters or fewer." };

    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;
    const oldName = resolved.name;
    if (oldName === newName) {
      return { ok: true, result: `Play is already named "${newName}" — no change.` };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { renamePlayAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
      const res = await renamePlayAction(playId, newName);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, result: `Renamed "${oldName}" → "${newName}".` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "rename_play failed" };
    }
  },
};

const update_play_notes: CoachAiTool = {
  def: {
    name: "update_play_notes",
    description:
      "Replace the notes field on an existing play. Use this for the coaching " +
      "narrative attached to a play — what the QB reads, what each skill player " +
      "should look for, and any decision points on option/choice routes. " +
      "DOES NOT touch the diagram. " +
      "ALWAYS show the coach the proposed notes and wait for explicit confirmation " +
      "before calling. Requires edit access to the playbook.\n\n" +
      "Style rules:\n" +
      "- Reference players by their on-field label using @Label (e.g. @Q, @F, @Y, @Z). " +
      "  The renderer auto-links these to the player tokens in the diagram.\n" +
      "- For OFFENSIVE plays: open with a one-line summary of the QB's reads " +
      "  based on what the defense shows. Then list each skill player's job in " +
      "  order. If any skill player has a decision (option route, choice route, " +
      "  read on leverage, sit vs. continue), call it out explicitly.\n" +
      "- For DEFENSIVE plays: open with what defenders should be watching for " +
      "  from the offense (formation tells, motion, route distributions). Then " +
      "  list each defender's read/key. Call out any pattern-match triggers.\n" +
      "- Keep it tight — 4-8 short bullets typically. Coaches will scan, not read.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, slot number (\"4\"), or exact name of the play to update.",
        },
        notes: {
          type: "string",
          description:
            "The new notes content. Use @Label to reference players. " +
            "Pass empty string to clear notes.",
        },
        edit_note: {
          type: "string",
          description: "Short one-line note for the version history. Default: 'Updated notes via Coach Cal'.",
        },
      },
      required: ["play_id", "notes"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const notes = typeof input.notes === "string" ? input.notes : "";
    if (notes.length > 4000) return { ok: false, error: "notes must be 4000 characters or fewer." };
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, playbook_id, current_version_id")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: "Play not found or not in this playbook." };

      const parentId = play.current_version_id as string | null;
      if (!parentId) {
        return { ok: false, error: "Play has no current version to update." };
      }
      const { data: parent, error: parentErr } = await admin
        .from("play_versions")
        .select("document")
        .eq("id", parentId)
        .maybeSingle();
      if (parentErr) return { ok: false, error: parentErr.message };
      const parentDoc = parent?.document as PlayDocument | null;
      if (!parentDoc) return { ok: false, error: "Could not read current play document." };

      const newDoc: PlayDocument = {
        ...parentDoc,
        metadata: {
          ...parentDoc.metadata,
          notes,
        },
      };

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const editNote = typeof input.edit_note === "string" && input.edit_note.trim()
        ? input.edit_note.trim()
        : "Updated notes via Coach Cal";

      const versionResult = await recordPlayVersion({
        supabase: admin,
        playId,
        document: newDoc,
        parentVersionId: parentId,
        userId: user.id,
        kind: "edit",
        note: editNote,
      });
      if (!versionResult.ok) return { ok: false, error: versionResult.error };
      if (versionResult.deduped) {
        return { ok: true, result: "Notes are already up to date — no change." };
      }
      const { error: upErr } = await admin
        .from("plays")
        .update({ current_version_id: versionResult.versionId, updated_at: new Date().toISOString() })
        .eq("id", playId);
      if (upErr) return { ok: false, error: upErr.message };
      return {
        ok: true,
        result: `Notes updated on "${play.name}" (version ${versionResult.versionId.slice(0, 8)}).`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "update_play_notes failed" };
    }
  },
};

// ─────────────────────────────────────────────────────────────────────
//  Practice plans
// ─────────────────────────────────────────────────────────────────────

const create_practice_plan: CoachAiTool = {
  def: {
    name: "create_practice_plan",
    description:
      "Create a new practice plan in the current playbook, optionally seeded " +
      "with a list of time blocks (warm-up / individual / team install / etc). " +
      "Use this when the coach asks you to save / build / make a practice plan " +
      "in their playbook (NOT just describe one in chat). " +
      "ALWAYS confirm the plan title and the block breakdown with the coach " +
      "before calling — show the proposed timeline in plain English (e.g. " +
      "'15 min warm-up → 20 min individual → 25 min team install → 10 min " +
      "conditioning, 70 min total — sound right?') and wait for an explicit " +
      "yes. Requires edit access to the playbook.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Practice plan title, e.g. \"Tuesday — Install + Special Teams\" " +
            "or \"Week 3 Practice 1\". 1-200 chars.",
        },
        notes: {
          type: "string",
          description:
            "Optional plan-level notes shown above the timeline. Use this " +
            "for the practice's overall focus / theme (e.g. 'Install Trips " +
            "Right concept; refine Cover 3 reads; prep for Saturday game').",
        },
        age_tier: {
          type: "string",
          enum: ["tier1_5_8", "tier2_9_11", "tier3_12_14", "tier4_hs"],
          description:
            "Optional age tier for content guidance. Pull from the playbook " +
            "context if the coach hasn't said.",
        },
        blocks: {
          type: "array",
          description:
            "Optional ordered list of time blocks. If omitted, the plan is " +
            "created empty and the coach fills it in via the editor. If " +
            "provided, each block must include a title + durationMinutes; " +
            "startOffsetMinutes is auto-computed sequentially when omitted. " +
            "Each block can have 1-3 parallel lanes (Skill / Line / etc.) " +
            "for stations.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Block label, e.g. \"Warm-up\", \"Individual\", \"Team install\"." },
              duration_minutes: { type: "integer", minimum: 1, maximum: 240 },
              start_offset_minutes: {
                type: "integer",
                minimum: 0,
                description: "Optional explicit start offset in minutes from the start of practice. Defaults to sequential layout.",
              },
              notes: { type: "string", description: "Plain-text coaching notes for this block." },
              lanes: {
                type: "array",
                maxItems: 3,
                description: "Optional 1-3 parallel lanes (stations). If omitted, a single lane is auto-created from the block title + notes.",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Lane label, e.g. \"Skill\", \"Line\", \"Specialists\"." },
                    notes: { type: "string", description: "Activity description / coaching points for this lane." },
                  },
                  required: [],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "duration_minutes"],
            additionalProperties: false,
          },
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const title = typeof input.title === "string" ? input.title : "";
    if (!title.trim()) return { ok: false, error: "title is required." };
    const notes = typeof input.notes === "string" ? input.notes : undefined;
    const ageTierRaw = typeof input.age_tier === "string" ? input.age_tier : undefined;
    const allowedTiers = ["tier1_5_8", "tier2_9_11", "tier3_12_14", "tier4_hs"] as const;
    type Tier = (typeof allowedTiers)[number];
    const ageTier: Tier | null =
      ageTierRaw && (allowedTiers as readonly string[]).includes(ageTierRaw)
        ? (ageTierRaw as Tier)
        : null;

    type RawBlock = {
      title?: unknown;
      duration_minutes?: unknown;
      start_offset_minutes?: unknown;
      notes?: unknown;
      lanes?: unknown;
    };
    const rawBlocks = Array.isArray(input.blocks) ? (input.blocks as RawBlock[]) : [];
    const blocks = rawBlocks
      .map((b) => ({
        title: typeof b?.title === "string" ? b.title : "Block",
        durationMinutes: typeof b?.duration_minutes === "number" ? b.duration_minutes : 0,
        startOffsetMinutes:
          typeof b?.start_offset_minutes === "number" ? b.start_offset_minutes : undefined,
        notes: typeof b?.notes === "string" ? b.notes : "",
        lanes: Array.isArray(b?.lanes)
          ? (b.lanes as Array<{ title?: unknown; notes?: unknown }>).map((l) => ({
              title: typeof l?.title === "string" ? l.title : "",
              notes: typeof l?.notes === "string" ? l.notes : "",
            }))
          : undefined,
      }))
      .filter((b) => b.durationMinutes > 0);

    try {
      const { createClient } = await import("@/lib/supabase/server");
      const { createPracticePlanForUser } = await import("@/lib/data/practice-plan-create");
      const supabase = await createClient();
      const res = await createPracticePlanForUser(supabase, {
        playbookId: ctx.playbookId,
        title: title.trim(),
        notes,
        ageTier,
        blocks: blocks.length > 0 ? blocks : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error };
      const url = `/practice-plans/${res.planId}/edit`;
      const summary = blocks.length > 0
        ? `${res.blockCount} block(s), ${res.totalDurationMinutes} min total`
        : "empty (coach will fill in via the editor)";
      return {
        ok: true,
        result:
          `Created practice plan "${title.trim()}" — ${summary}. Tell the coach it's saved and link them: ` +
          `[Open practice plan](${url}). It also shows up in the Practice Plans tab of the playbook.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "create_practice_plan failed" };
    }
  },
};

export const PLAY_TOOLS: CoachAiTool[] = [
  list_plays,
  get_play,
  create_play,
  update_play,
  rename_play,
  update_play_notes,
  create_practice_plan,
];
