import { createClient } from "@/lib/supabase/server";
import { embedText, vectorLiteral } from "./embed";
import type { CoachAiTool, ToolContext } from "./tools";

/**
 * KB curation tools — admin training mode only.
 *
 * These mutate the global rag_documents table and append rag_document_revisions
 * snapshots. RLS policy (rag_documents_write_global) requires public.is_site_admin(),
 * but we also enforce isAdmin in JS so the tool short-circuits with a clear error.
 *
 * Confirmation flow: enforced via the system prompt — the agent is required to
 * summarize each proposed change and wait for user confirmation before calling
 * any write tool. There is no `confirmed` flag in the tool schema.
 */

const TOPICS = ["rules", "scheme", "terminology", "tactics"] as const;
type Topic = (typeof TOPICS)[number];

function isTopic(v: unknown): v is Topic {
  return typeof v === "string" && (TOPICS as readonly string[]).includes(v);
}

function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function requireAdmin(ctx: ToolContext) {
  if (!ctx.isAdmin) {
    throw new Error("KB write tools are admin-only.");
  }
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

// ─── add_kb_entry ─────────────────────────────────────────────────────────────

const add_kb_entry: CoachAiTool = {
  def: {
    name: "add_kb_entry",
    description:
      "Add a new entry to the global Coach AI knowledge base. Only call this AFTER " +
      "you have summarized the proposed entry to the user and they have explicitly " +
      "confirmed. Embeds the entry immediately so it is searchable on the next turn.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title (≤120 chars). Front-loads keywords for retrieval." },
        content: { type: "string", description: "Full entry text. Self-contained — readable without external context." },
        topic: { type: "string", enum: [...TOPICS], description: "Top-level topic." },
        subtopic: { type: "string", description: "Optional narrower topic, e.g. 'kickoff', 'motion', 'tampa_2'." },
        sport_variant: { type: "string", description: "e.g. 'nfl_flag_5v5', 'flag_7v7', 'tackle'. Null/omit if it applies to all variants." },
        game_level: { type: "string", description: "e.g. 'youth', 'high_school', 'adult'. Optional." },
        sanctioning_body: { type: "string", description: "e.g. 'nfl_flag', 'pop_warner', 'ayf', 'nfhs'. Optional." },
        age_division: { type: "string", description: "e.g. '8u', '12u'. Optional." },
        source_url: { type: "string", description: "Authoritative URL if user provided one." },
        source_note: { type: "string", description: "Free-form provenance, e.g. 'told to me by the user 2026-04-26'." },
        change_summary: { type: "string", description: "One-line summary of what is being added (for revision history)." },
      },
      required: ["title", "content", "topic", "change_summary"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    try {
      requireAdmin(ctx);
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
          scope: "global",
          scope_id: null,
          topic: input.topic,
          subtopic: nullableString(input.subtopic),
          title,
          content,
          sport_variant: nullableString(input.sport_variant),
          game_level: nullableString(input.game_level),
          sanctioning_body: nullableString(input.sanctioning_body),
          age_division: nullableString(input.age_division),
          source: "admin_chat",
          source_url: nullableString(input.source_url),
          source_note: nullableString(input.source_note),
          authoritative: false,
          needs_review: true,
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
        source: "admin_chat",
        source_url: nullableString(input.source_url),
        source_note: nullableString(input.source_note),
        authoritative: false,
        needs_review: true,
        change_kind: "create",
        change_summary,
        changed_by: created_by,
      });
      if (revErr) return { ok: false, error: `revision: ${revErr.message}` };

      return {
        ok: true,
        result: `Added KB entry ${inserted.id} — "${inserted.title}" (${inserted.topic}${inserted.subtopic ? `/${inserted.subtopic}` : ""}). Searchable now.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "add_kb_entry failed" };
    }
  },
};

// ─── edit_kb_entry ────────────────────────────────────────────────────────────

const edit_kb_entry: CoachAiTool = {
  def: {
    name: "edit_kb_entry",
    description:
      "Edit an existing KB entry. Only call AFTER summarizing the diff to the user " +
      "and getting confirmation. Re-embeds the entry if title or content changed. " +
      "Appends a new revision snapshot.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "rag_documents.id (uuid) of the entry to edit." },
        title: { type: "string" },
        content: { type: "string" },
        subtopic: { type: "string" },
        sport_variant: { type: "string" },
        game_level: { type: "string" },
        sanctioning_body: { type: "string" },
        age_division: { type: "string" },
        source_url: { type: "string" },
        source_note: { type: "string" },
        authoritative: { type: "boolean", description: "Set true once a human has verified this entry against the official source." },
        needs_review: { type: "boolean" },
        change_summary: { type: "string", description: "One-line summary of the edit." },
      },
      required: ["id", "change_summary"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    try {
      requireAdmin(ctx);
      const id = nullableString(input.id);
      const change_summary = nullableString(input.change_summary);
      if (!id) return { ok: false, error: "id is required" };

      const supabase = await createClient();
      const { data: existing, error: getErr } = await supabase
        .from("rag_documents")
        .select("title, content, subtopic, sport_variant, game_level, sanctioning_body, age_division, source, source_url, source_note, authoritative, needs_review, scope, retired_at")
        .eq("id", id)
        .maybeSingle();
      if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
      if (!existing) return { ok: false, error: `no KB entry with id ${id}` };
      if (existing.scope !== "global") {
        return { ok: false, error: "edit_kb_entry only supports global-scope entries in admin mode" };
      }
      if (existing.retired_at) {
        return { ok: false, error: "entry is retired — restore it before editing" };
      }

      const next = {
        title: nullableString(input.title) ?? existing.title,
        content: nullableString(input.content) ?? existing.content,
        subtopic:
          input.subtopic === undefined ? existing.subtopic : nullableString(input.subtopic),
        sport_variant:
          input.sport_variant === undefined ? existing.sport_variant : nullableString(input.sport_variant),
        game_level:
          input.game_level === undefined ? existing.game_level : nullableString(input.game_level),
        sanctioning_body:
          input.sanctioning_body === undefined ? existing.sanctioning_body : nullableString(input.sanctioning_body),
        age_division:
          input.age_division === undefined ? existing.age_division : nullableString(input.age_division),
        source_url:
          input.source_url === undefined ? existing.source_url : nullableString(input.source_url),
        source_note:
          input.source_note === undefined ? existing.source_note : nullableString(input.source_note),
        authoritative:
          typeof input.authoritative === "boolean" ? input.authoritative : existing.authoritative,
        needs_review:
          typeof input.needs_review === "boolean" ? input.needs_review : existing.needs_review,
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
        source_url: next.source_url,
        source_note: next.source_note,
        authoritative: next.authoritative,
        needs_review: next.needs_review,
        change_kind: "edit",
        change_summary,
        changed_by,
      });
      if (revErr) return { ok: false, error: `revision: ${revErr.message}` };

      const reembedNote = contentChanged ? " Re-embedded; searchable now." : "";
      return { ok: true, result: `Edited KB entry ${id} (rev ${revision_number}).${reembedNote}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "edit_kb_entry failed" };
    }
  },
};

// ─── retire_kb_entry ──────────────────────────────────────────────────────────

const retire_kb_entry: CoachAiTool = {
  def: {
    name: "retire_kb_entry",
    description:
      "Soft-delete a KB entry (sets retired_at). Excludes it from future search but " +
      "preserves it in revision history. Only call AFTER summarizing what you're " +
      "about to retire and getting confirmation.",
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
      requireAdmin(ctx);
      const id = nullableString(input.id);
      const change_summary = nullableString(input.change_summary);
      if (!id) return { ok: false, error: "id is required" };

      const supabase = await createClient();
      const { data: existing, error: getErr } = await supabase
        .from("rag_documents")
        .select("title, content, source, source_url, source_note, authoritative, needs_review, scope, retired_at")
        .eq("id", id)
        .maybeSingle();
      if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
      if (!existing) return { ok: false, error: `no KB entry with id ${id}` };
      if (existing.scope !== "global") {
        return { ok: false, error: "retire_kb_entry only supports global-scope entries" };
      }
      if (existing.retired_at) {
        return { ok: true, result: `KB entry ${id} was already retired.` };
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

      return { ok: true, result: `Retired KB entry ${id} (rev ${revision_number}).` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "retire_kb_entry failed" };
    }
  },
};

// ─── list_kb_topics ───────────────────────────────────────────────────────────

const list_kb_topics: CoachAiTool = {
  def: {
    name: "list_kb_topics",
    description:
      "List the (topic, subtopic, sport_variant) groupings in the global KB with " +
      "entry counts. Use this to orient yourself before adding entries — pick an " +
      "existing subtopic if one fits, rather than inventing a new one.",
    input_schema: {
      type: "object",
      properties: {
        sport_variant: { type: "string", description: "Optional filter." },
      },
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    try {
      requireAdmin(ctx);
      const supabase = await createClient();
      let q = supabase
        .from("rag_documents")
        .select("topic, subtopic, sport_variant")
        .eq("scope", "global")
        .is("retired_at", null);
      const sv = nullableString(input.sport_variant);
      if (sv) q = q.eq("sport_variant", sv);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const key = [row.topic, row.subtopic ?? "—", row.sport_variant ?? "—"].join(" / ");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 0) return { ok: true, result: "No global KB entries yet." };
      const lines = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${n.toString().padStart(3)}  ${k}`);
      return { ok: true, result: `topic / subtopic / sport_variant\n${lines.join("\n")}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_kb_topics failed" };
    }
  },
};

// ─── get_kb_revisions ─────────────────────────────────────────────────────────

const get_kb_revisions: CoachAiTool = {
  def: {
    name: "get_kb_revisions",
    description: "Fetch the revision history for a single KB entry, newest first.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "rag_documents.id" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    try {
      requireAdmin(ctx);
      const id = nullableString(input.id);
      if (!id) return { ok: false, error: "id is required" };
      const limit =
        typeof input.limit === "number" ? Math.min(50, Math.max(1, Math.floor(input.limit))) : 10;
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("rag_document_revisions")
        .select("revision_number, change_kind, change_summary, created_at, title")
        .eq("document_id", id)
        .order("revision_number", { ascending: false })
        .limit(limit);
      if (error) return { ok: false, error: error.message };
      if (!data || data.length === 0) return { ok: true, result: "No revisions." };
      const lines = data.map(
        (r) =>
          `rev ${r.revision_number}  ${r.created_at}  [${r.change_kind}]  ${r.change_summary ?? "—"}  (title: ${r.title})`,
      );
      return { ok: true, result: lines.join("\n") };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "get_kb_revisions failed" };
    }
  },
};

export const KB_ADMIN_TOOLS: CoachAiTool[] = [
  list_kb_topics,
  get_kb_revisions,
  add_kb_entry,
  edit_kb_entry,
  retire_kb_entry,
];
