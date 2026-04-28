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

/** Convert a saved PlayDocument back into the CoachDiagram yard-based format. */
export function playDocumentToCoachDiagram(doc: PlayDocument, name: string): CoachDiagram {
  const { fieldWidthYds, fieldLengthYds, variant } = doc.sportProfile;
  const players = doc.layers.players.map((p) => ({
    id: p.label || p.id,
    role: p.label || p.role,
    x: Math.round(((p.position.x - 0.5) * fieldWidthYds) * 10) / 10,
    y: Math.round(((p.position.y - LOS_Y) * fieldLengthYds) * 10) / 10,
    team: (p.style.fill === "#DC2626" || p.style.fill === "#B91C1C") ? "D" as const : "O" as const,
    color: p.style.fill,
  }));

  const routes = doc.layers.routes.map((r) => {
    const carrier = doc.layers.players.find((p) => p.id === r.carrierPlayerId);
    const nodes = r.nodes.slice(1); // skip start node (= player position)
    const path: [number, number][] = nodes.map((n) => [
      Math.round(((n.position.x - 0.5) * fieldWidthYds) * 10) / 10,
      Math.round(((n.position.y - LOS_Y) * fieldLengthYds) * 10) / 10,
    ]);
    const fromLabel = carrier ? (carrier.label || carrier.id) : r.carrierPlayerId;
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
      const { data, error } = await admin
        .from("plays")
        .select("id, name, formation_name, play_type, group_id, tags, is_archived")
        .eq("playbook_id", ctx.playbookId)
        .eq("is_archived", false)
        .is("deleted_at", null)
        .is("attached_to_play_id", null)
        .order("name", { ascending: true });

      if (error) return { ok: false, error: error.message };
      if (!data || data.length === 0) return { ok: true, result: "No plays found in this playbook." };

      let rows = data as Array<{
        id: string;
        name: string;
        formation_name: string | null;
        play_type: string | null;
        group_id: string | null;
        tags: string[] | null;
        is_archived: boolean;
      }>;

      if (filter) {
        rows = rows.filter((r) => r.name.toLowerCase().includes(filter));
      }

      if (rows.length === 0) return { ok: true, result: `No plays match "${input.filter_name}".` };

      const lines = rows.map((r) => {
        const meta = [
          r.play_type ?? "offense",
          r.formation_name ? `formation: ${r.formation_name}` : null,
          r.tags && r.tags.length > 0 ? `tags: ${r.tags.join(", ")}` : null,
        ].filter(Boolean).join(" | ");
        return `• [${r.id}] ${r.name} — ${meta}`;
      });
      return { ok: true, result: `${rows.length} play(s):\n${lines.join("\n")}` };
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
      "Use list_plays first to find the play id.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "The UUID of the play to retrieve.",
        },
      },
      required: ["play_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    const playId = typeof input.play_id === "string" ? input.play_id : "";
    if (!playId) return { ok: false, error: "play_id is required." };

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
          description: "The UUID of the play to update.",
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

    const playId = typeof input.play_id === "string" ? input.play_id : "";
    if (!playId) return { ok: false, error: "play_id is required." };

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
        play_id: { type: "string", description: "The UUID of the play to rename." },
        new_name: { type: "string", description: "The new play name. 1-80 chars, trimmed." },
      },
      required: ["play_id", "new_name"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const playId = typeof input.play_id === "string" ? input.play_id : "";
    const newName = typeof input.new_name === "string" ? input.new_name.trim() : "";
    if (!playId) return { ok: false, error: "play_id is required." };
    if (!newName) return { ok: false, error: "new_name can't be empty." };
    if (newName.length > 80) return { ok: false, error: "new_name must be 80 characters or fewer." };

    try {
      // Confirm the play belongs to the anchored playbook before delegating.
      const admin = createServiceRoleClient();
      const { data: play, error: readErr } = await admin
        .from("plays")
        .select("id, name, playbook_id")
        .eq("id", playId)
        .is("deleted_at", null)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      if (!play) return { ok: false, error: "Play not found." };
      if (play.playbook_id !== ctx.playbookId) {
        return { ok: false, error: "That play belongs to a different playbook." };
      }
      const oldName = play.name as string;
      if (oldName === newName) {
        return { ok: true, result: `Play is already named "${newName}" — no change.` };
      }

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
        play_id: { type: "string", description: "The UUID of the play to update." },
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
    const playId = typeof input.play_id === "string" ? input.play_id : "";
    const notes = typeof input.notes === "string" ? input.notes : "";
    if (!playId) return { ok: false, error: "play_id is required." };
    if (notes.length > 4000) return { ok: false, error: "notes must be 4000 characters or fewer." };

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

export const PLAY_TOOLS: CoachAiTool[] = [list_plays, get_play, create_play, update_play, rename_play, update_play_notes];
