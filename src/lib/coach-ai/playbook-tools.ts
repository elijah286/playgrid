import { createClient } from "@/lib/supabase/server";
import { embedText, vectorLiteral } from "./embed";
import type { CoachAiTool, ToolContext } from "./tools";

/**
 * Playbook-scoped KB curation tools — playbook_training mode only.
 *
 * Mirrors kb-tools.ts but writes scope='playbook', scope_id=ctx.playbookId.
 * RLS (rag_documents_write_playbook) enforces can_edit_playbook on every
 * write; we also short-circuit in JS when canEditPlaybook is false so the
 * tool returns a clear error instead of a Postgres permission failure.
 *
 * Coach-authored notes are marked authoritative=true: the head coach is the
 * authority on their own team's schemes, personnel, and opponent notes.
 *
 * Confirmation flow is enforced via the system prompt — no confirmed flag.
 */

const TOPICS = ["scheme", "terminology", "tactics", "personnel", "opponent", "notes"] as const;
type Topic = (typeof TOPICS)[number];

function isTopic(v: unknown): v is Topic {
  return typeof v === "string" && (TOPICS as readonly string[]).includes(v);
}

function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function requirePerm(ctx: ToolContext) {
  if (!ctx.playbookId) throw new Error("Playbook KB tools require a playbook context.");
  if (!ctx.canEditPlaybook) throw new Error("Playbook KB tools require edit access to this playbook.");
}

async function nextRevisionNumber(documentId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rag_document_revisions")
    .select("revision_number")
    .eq("document_id", documentId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`revision lookup: ${error.message}`);
  return (data?.revision_number ?? 0) + 1;
}

// ─── add_playbook_note ────────────────────────────────────────────────────────

const add_playbook_note: CoachAiTool = {
  def: {
    name: "add_playbook_note",
    description:
      "Add a note to THIS playbook's knowledge base — visible to all members of the playbook. " +
      "Use for team-specific knowledge: schemes the coach runs, personnel notes, opponent " +
      "tendencies, terminology this team uses. Only call AFTER summarizing the proposed entry " +
      "and getting explicit confirmation. Embedded immediately so it is searchable next turn.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title (≤120 chars). Front-load keywords for retrieval." },
        content: { type: "string", description: "Full note. Self-contained — readable without external context." },
        topic: { type: "string", enum: [...TOPICS], description: "Top-level topic." },
        subtopic: { type: "string", description: "Optional narrower tag, e.g. 'cover_3_beater', 'qb_arm_strength'." },
        source_note: { type: "string", description: "Free-form provenance, e.g. 'told to me by head coach in chat 2026-04-26'." },
        change_summary: { type: "string", description: "One-line summary of what is being added." },
      },
      required: ["title", "content", "topic", "change_summary"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    try {
      requirePerm(ctx);
      const title = nullableString(input.title);
      const content = nullableString(input.content);
      const change_summary = nullableString(input.change_summary);
      if (!title || !content) return { ok: false, error: "title and content are required" };
      if (!isTopic(input.topic)) return { ok: false, error: `topic must be one of: ${TOPICS.join(", ")}` };

      const embedding = await embedText(`${title}\n\n${content}`);
      const supabase = await createClient();
      const { data: userRes } = await supabase.auth.getUser();
      const created_by = userRes.user?.id ?? null;

      const { data: inserted, error: insErr } = await supabase
        .from("rag_documents")
        .insert({
          scope: "playbook",
          scope_id: ctx.playbookId,
          topic: input.topic,
          subtopic: nullableString(input.subtopic),
          title,
          content,
          sport_variant: ctx.sportVariant,
          game_level: ctx.gameLevel,
          sanctioning_body: ctx.sanctioningBody,
          age_division: ctx.ageDivision,
          source: "coach_chat",
          source_url: null,
          source_note: nullableString(input.source_note),
          authoritative: true,
          needs_review: false,
          created_by,
          embedding: vectorLiteral(embedding),
        })
        .select("id, title, topic, subtopic")
        .single();
      if (insErr) return { ok: false, error: `insert: ${insErr.message}` };

      const { error: revErr } = await supabase.from("rag_document_revisions").insert({
        document_id: inserted.id,
        revision_number: 1,
        title,
        content,
        source: "coach_chat",
        source_url: null,
        source_note: nullableString(input.source_note),
        authoritative: true,
        needs_review: false,
        change_kind: "create",
        change_summary,
        changed_by: created_by,
      });
      if (revErr) return { ok: false, error: `revision: ${revErr.message}` };

      return {
        ok: true,
        result: `Added playbook note ${inserted.id} — "${inserted.title}" (${inserted.topic}${inserted.subtopic ? `/${inserted.subtopic}` : ""}). Searchable now.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "add_playbook_note failed" };
    }
  },
};

// ─── edit_playbook_note ───────────────────────────────────────────────────────

const edit_playbook_note: CoachAiTool = {
  def: {
    name: "edit_playbook_note",
    description:
      "Edit an existing note on THIS playbook. Only call AFTER summarizing the diff and " +
      "getting confirmation. Re-embeds if title or content changed. Appends a revision.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "rag_documents.id of the note to edit." },
        title: { type: "string" },
        content: { type: "string" },
        subtopic: { type: "string" },
        source_note: { type: "string" },
        change_summary: { type: "string", description: "One-line summary of the edit." },
      },
      required: ["id", "change_summary"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    try {
      requirePerm(ctx);
      const id = nullableString(input.id);
      const change_summary = nullableString(input.change_summary);
      if (!id) return { ok: false, error: "id is required" };

      const supabase = await createClient();
      const { data: existing, error: getErr } = await supabase
        .from("rag_documents")
        .select("title, content, subtopic, source, source_url, source_note, authoritative, needs_review, scope, scope_id, retired_at")
        .eq("id", id)
        .maybeSingle();
      if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
      if (!existing) return { ok: false, error: `no note with id ${id}` };
      if (existing.scope !== "playbook" || existing.scope_id !== ctx.playbookId) {
        return { ok: false, error: "edit_playbook_note can only edit notes belonging to the current playbook" };
      }
      if (existing.retired_at) {
        return { ok: false, error: "note is retired — restore it before editing" };
      }

      const next = {
        title: nullableString(input.title) ?? existing.title,
        content: nullableString(input.content) ?? existing.content,
        subtopic:
          input.subtopic === undefined ? existing.subtopic : nullableString(input.subtopic),
        source_note:
          input.source_note === undefined ? existing.source_note : nullableString(input.source_note),
      };

      const contentChanged = next.title !== existing.title || next.content !== existing.content;
      const update: Record<string, unknown> = { ...next };
      if (contentChanged) {
        const vec = await embedText(`${next.title}\n\n${next.content}`);
        update.embedding = vectorLiteral(vec);
      }

      const { error: upErr } = await supabase.from("rag_documents").update(update).eq("id", id);
      if (upErr) return { ok: false, error: `update: ${upErr.message}` };

      const { data: userRes } = await supabase.auth.getUser();
      const changed_by = userRes.user?.id ?? null;
      const revision_number = await nextRevisionNumber(id);
      const { error: revErr } = await supabase.from("rag_document_revisions").insert({
        document_id: id,
        revision_number,
        title: next.title,
        content: next.content,
        source: existing.source,
        source_url: existing.source_url,
        source_note: next.source_note,
        authoritative: existing.authoritative,
        needs_review: existing.needs_review,
        change_kind: "edit",
        change_summary,
        changed_by,
      });
      if (revErr) return { ok: false, error: `revision: ${revErr.message}` };

      const reembedNote = contentChanged ? " Re-embedded; searchable now." : "";
      return { ok: true, result: `Edited playbook note ${id} (rev ${revision_number}).${reembedNote}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "edit_playbook_note failed" };
    }
  },
};

// ─── retire_playbook_note ─────────────────────────────────────────────────────

const retire_playbook_note: CoachAiTool = {
  def: {
    name: "retire_playbook_note",
    description:
      "Soft-delete a playbook note (sets retired_at). Excludes it from future search. " +
      "Only call AFTER summarizing what's being removed and getting confirmation.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "rag_documents.id" },
        change_summary: { type: "string", description: "One-line reason for retiring." },
      },
      required: ["id", "change_summary"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    try {
      requirePerm(ctx);
      const id = nullableString(input.id);
      const change_summary = nullableString(input.change_summary);
      if (!id) return { ok: false, error: "id is required" };

      const supabase = await createClient();
      const { data: existing, error: getErr } = await supabase
        .from("rag_documents")
        .select("title, content, source, source_url, source_note, authoritative, needs_review, scope, scope_id, retired_at")
        .eq("id", id)
        .maybeSingle();
      if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
      if (!existing) return { ok: false, error: `no note with id ${id}` };
      if (existing.scope !== "playbook" || existing.scope_id !== ctx.playbookId) {
        return { ok: false, error: "retire_playbook_note can only retire notes belonging to the current playbook" };
      }
      if (existing.retired_at) {
        return { ok: true, result: `Note ${id} was already retired.` };
      }

      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from("rag_documents")
        .update({ retired_at: now })
        .eq("id", id);
      if (upErr) return { ok: false, error: `retire: ${upErr.message}` };

      const { data: userRes } = await supabase.auth.getUser();
      const changed_by = userRes.user?.id ?? null;
      const revision_number = await nextRevisionNumber(id);
      const { error: revErr } = await supabase.from("rag_document_revisions").insert({
        document_id: id,
        revision_number,
        title: existing.title,
        content: existing.content,
        source: existing.source,
        source_url: existing.source_url,
        source_note: existing.source_note,
        authoritative: existing.authoritative,
        needs_review: existing.needs_review,
        change_kind: "retire",
        change_summary,
        changed_by,
      });
      if (revErr) return { ok: false, error: `revision: ${revErr.message}` };

      return { ok: true, result: `Retired playbook note ${id} (rev ${revision_number}).` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "retire_playbook_note failed" };
    }
  },
};

// ─── list_playbook_notes ──────────────────────────────────────────────────────

const list_playbook_notes: CoachAiTool = {
  def: {
    name: "list_playbook_notes",
    description:
      "List notes in THIS playbook's knowledge base, grouped by (topic, subtopic) with " +
      "counts. Use to orient yourself before adding — pick an existing subtopic if it fits.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  async handler(_input, ctx) {
    try {
      requirePerm(ctx);
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("rag_documents")
        .select("topic, subtopic")
        .eq("scope", "playbook")
        .eq("scope_id", ctx.playbookId)
        .is("retired_at", null);
      if (error) return { ok: false, error: error.message };

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const key = [row.topic, row.subtopic ?? "—"].join(" / ");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 0) return { ok: true, result: "No playbook notes yet." };
      const lines = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${n.toString().padStart(3)}  ${k}`);
      return { ok: true, result: `topic / subtopic\n${lines.join("\n")}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_playbook_notes failed" };
    }
  },
};

export const PLAYBOOK_KB_TOOLS: CoachAiTool[] = [
  list_playbook_notes,
  add_playbook_note,
  edit_playbook_note,
  retire_playbook_note,
];
