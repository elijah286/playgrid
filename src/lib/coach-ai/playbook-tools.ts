import { createClient } from "@/lib/supabase/server";
import { embedText, vectorLiteral } from "./embed";
import type { CoachAiTool, ToolContext } from "./tools";

/**
 * Playbook-scoped KB curation tools — available whenever the chat is
 * anchored to a playbook the coach can edit.
 *
 * These tools NEVER write directly. Instead they emit a structured
 * proposal payload (a fenced JSON block in the tool result) that the
 * chat surface renders as an inline confirmation chip. The coach
 * clicks "Save to playbook notes" to commit, which calls
 * `applyPlaybookNoteProposal` via a server action.
 *
 * This replaces the older "Playbook Training Mode" toggle: confirmation
 * is now a UI affordance instead of a separate mode + text-prompt
 * discipline. Cal can propose saves any time; the coach decides.
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

// ─── Proposal payload — emitted in tool result inside ```note-proposal fence ──

export type NoteProposalAdd = {
  kind: "add";
  proposalId: string;
  title: string;
  content: string;
  topic: Topic;
  subtopic: string | null;
  source_note: string | null;
  change_summary: string;
};

export type NoteProposalEdit = {
  kind: "edit";
  proposalId: string;
  documentId: string;
  /** Pre-edit values, included so the chip can render a clear before/after. */
  before: { title: string; content: string; subtopic: string | null; source_note: string | null };
  /** Post-edit values applied verbatim on commit. */
  after: { title: string; content: string; subtopic: string | null; source_note: string | null };
  change_summary: string;
};

export type NoteProposalRetire = {
  kind: "retire";
  proposalId: string;
  documentId: string;
  /** Snapshot of what's being removed, so the chip can show the user what will go. */
  snapshot: { title: string; topic: string; subtopic: string | null };
  change_summary: string;
};

export type NoteProposal = NoteProposalAdd | NoteProposalEdit | NoteProposalRetire;

function newProposalId(): string {
  // Crypto.randomUUID is available in Node 19+ and all modern browsers; this
  // tool only runs server-side under createClient(), so it's always present.
  return globalThis.crypto.randomUUID();
}

function fenceProposal(p: NoteProposal): string {
  return `\`\`\`note-proposal\n${JSON.stringify(p)}\n\`\`\``;
}

// ─── propose_add_playbook_note ────────────────────────────────────────────────

const propose_add_playbook_note: CoachAiTool = {
  def: {
    name: "propose_add_playbook_note",
    description:
      "Propose adding a note to THIS playbook's knowledge base. The coach must click " +
      "'Save to playbook notes' on the resulting chip — this tool does NOT write. Use " +
      "whenever the coach states a team-specific preference, scheme detail, terminology, " +
      "personnel note, or opponent tendency that is worth persisting. You can propose more " +
      "than one in a turn — render each as its own chip. Visible to all members of the playbook.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title (≤120 chars). Front-load keywords for retrieval." },
        content: { type: "string", description: "Full note. Self-contained — readable without external context." },
        topic: { type: "string", enum: [...TOPICS], description: "Top-level topic." },
        subtopic: { type: "string", description: "Optional narrower tag, e.g. 'cover_3_beater', 'qb_arm_strength'." },
        source_note: { type: "string", description: "Free-form provenance, e.g. 'told to me by head coach in chat'." },
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
      if (!title || !content || !change_summary) {
        return { ok: false, error: "title, content, and change_summary are required" };
      }
      if (!isTopic(input.topic)) {
        return { ok: false, error: `topic must be one of: ${TOPICS.join(", ")}` };
      }
      const proposal: NoteProposalAdd = {
        kind: "add",
        proposalId: newProposalId(),
        title,
        content,
        topic: input.topic,
        subtopic: nullableString(input.subtopic),
        source_note: nullableString(input.source_note),
        change_summary,
      };
      return {
        ok: true,
        result: `Proposed add: "${title}" (${proposal.topic}${proposal.subtopic ? `/${proposal.subtopic}` : ""}). Awaiting coach confirmation via the inline chip.\n\n${fenceProposal(proposal)}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "propose_add_playbook_note failed" };
    }
  },
};

// ─── propose_edit_playbook_note ───────────────────────────────────────────────

const propose_edit_playbook_note: CoachAiTool = {
  def: {
    name: "propose_edit_playbook_note",
    description:
      "Propose editing an existing note on THIS playbook. The coach must click 'Save' on " +
      "the resulting chip — this tool does NOT write. Use when the coach corrects or refines " +
      "an existing note. Provide the full new title/content (not a diff).",
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
      if (!id || !change_summary) {
        return { ok: false, error: "id and change_summary are required" };
      }
      const supabase = await createClient();
      const { data: existing, error: getErr } = await supabase
        .from("rag_documents")
        .select("title, content, subtopic, source_note, scope, scope_id, retired_at")
        .eq("id", id)
        .maybeSingle();
      if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
      if (!existing) return { ok: false, error: `no note with id ${id}` };
      if (existing.scope !== "playbook" || existing.scope_id !== ctx.playbookId) {
        return { ok: false, error: "edit can only target notes belonging to the current playbook" };
      }
      if (existing.retired_at) {
        return { ok: false, error: "note is retired — restore it before editing" };
      }
      const after = {
        title: nullableString(input.title) ?? (existing.title as string),
        content: nullableString(input.content) ?? (existing.content as string),
        subtopic:
          input.subtopic === undefined ? (existing.subtopic as string | null) : nullableString(input.subtopic),
        source_note:
          input.source_note === undefined ? (existing.source_note as string | null) : nullableString(input.source_note),
      };
      const proposal: NoteProposalEdit = {
        kind: "edit",
        proposalId: newProposalId(),
        documentId: id,
        before: {
          title: existing.title as string,
          content: existing.content as string,
          subtopic: (existing.subtopic as string | null) ?? null,
          source_note: (existing.source_note as string | null) ?? null,
        },
        after,
        change_summary,
      };
      return {
        ok: true,
        result: `Proposed edit on note ${id}. Awaiting coach confirmation via the inline chip.\n\n${fenceProposal(proposal)}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "propose_edit_playbook_note failed" };
    }
  },
};

// ─── propose_retire_playbook_note ─────────────────────────────────────────────

const propose_retire_playbook_note: CoachAiTool = {
  def: {
    name: "propose_retire_playbook_note",
    description:
      "Propose retiring (soft-deleting) a playbook note. The coach must click 'Save' on the " +
      "resulting chip — this tool does NOT write. Use when the coach says a note is wrong or stale.",
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
      if (!id || !change_summary) {
        return { ok: false, error: "id and change_summary are required" };
      }
      const supabase = await createClient();
      const { data: existing, error: getErr } = await supabase
        .from("rag_documents")
        .select("title, topic, subtopic, scope, scope_id, retired_at")
        .eq("id", id)
        .maybeSingle();
      if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
      if (!existing) return { ok: false, error: `no note with id ${id}` };
      if (existing.scope !== "playbook" || existing.scope_id !== ctx.playbookId) {
        return { ok: false, error: "retire can only target notes belonging to the current playbook" };
      }
      if (existing.retired_at) {
        return { ok: false, error: `note ${id} is already retired` };
      }
      const proposal: NoteProposalRetire = {
        kind: "retire",
        proposalId: newProposalId(),
        documentId: id,
        snapshot: {
          title: existing.title as string,
          topic: existing.topic as string,
          subtopic: (existing.subtopic as string | null) ?? null,
        },
        change_summary,
      };
      return {
        ok: true,
        result: `Proposed retire of note ${id}. Awaiting coach confirmation via the inline chip.\n\n${fenceProposal(proposal)}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "propose_retire_playbook_note failed" };
    }
  },
};

// ─── list_playbook_notes ──────────────────────────────────────────────────────

const list_playbook_notes: CoachAiTool = {
  def: {
    name: "list_playbook_notes",
    description:
      "List notes in THIS playbook's knowledge base, grouped by (topic, subtopic) with " +
      "counts. Use to orient yourself before proposing — pick an existing subtopic if it fits.",
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
  propose_add_playbook_note,
  propose_edit_playbook_note,
  propose_retire_playbook_note,
];

// ─── Apply (server-side commit) ───────────────────────────────────────────────

/**
 * Commit a NoteProposal to the playbook KB. Called from the server action
 * triggered by the coach clicking "Save" on an inline proposal chip.
 *
 * Caller is responsible for: verifying the user is signed in, the proposal
 * targets a playbook the user can edit, and (for edit/retire) the document
 * still belongs to that playbook. This function performs the same checks
 * defensively in JS (RLS will also enforce them at the DB layer).
 */
export async function applyPlaybookNoteProposal(args: {
  proposal: NoteProposal;
  playbookId: string;
  sportVariant: string | null;
  gameLevel: string | null;
  sanctioningBody: string | null;
  ageDivision: string | null;
}): Promise<{ ok: true; documentId: string; revisionNumber: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id ?? null;
  if (!userId) return { ok: false, error: "Not signed in." };

  const { data: canEdit } = await supabase.rpc("can_edit_playbook", { pb: args.playbookId });
  if (!canEdit) return { ok: false, error: "You can't edit this playbook." };

  const p = args.proposal;
  if (p.kind === "add") {
    const embedding = await embedText(`${p.title}\n\n${p.content}`);
    const { data: inserted, error: insErr } = await supabase
      .from("rag_documents")
      .insert({
        scope: "playbook",
        scope_id: args.playbookId,
        topic: p.topic,
        subtopic: p.subtopic,
        title: p.title,
        content: p.content,
        sport_variant: args.sportVariant,
        game_level: args.gameLevel,
        sanctioning_body: args.sanctioningBody,
        age_division: args.ageDivision,
        source: "coach_chat",
        source_url: null,
        source_note: p.source_note,
        authoritative: true,
        needs_review: false,
        created_by: userId,
        embedding: vectorLiteral(embedding),
      })
      .select("id")
      .single();
    if (insErr || !inserted) return { ok: false, error: `insert: ${insErr?.message ?? "unknown"}` };
    const { error: revErr } = await supabase.from("rag_document_revisions").insert({
      document_id: inserted.id,
      revision_number: 1,
      title: p.title,
      content: p.content,
      source: "coach_chat",
      source_url: null,
      source_note: p.source_note,
      authoritative: true,
      needs_review: false,
      change_kind: "create",
      change_summary: p.change_summary,
      changed_by: userId,
    });
    if (revErr) return { ok: false, error: `revision: ${revErr.message}` };
    return { ok: true, documentId: inserted.id as string, revisionNumber: 1 };
  }

  if (p.kind === "edit") {
    const { data: existing, error: getErr } = await supabase
      .from("rag_documents")
      .select("title, content, subtopic, source, source_url, source_note, authoritative, needs_review, scope, scope_id, retired_at")
      .eq("id", p.documentId)
      .maybeSingle();
    if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
    if (!existing) return { ok: false, error: `no note with id ${p.documentId}` };
    if (existing.scope !== "playbook" || existing.scope_id !== args.playbookId) {
      return { ok: false, error: "note doesn't belong to this playbook" };
    }
    if (existing.retired_at) return { ok: false, error: "note is retired" };

    const next = p.after;
    const contentChanged = next.title !== existing.title || next.content !== existing.content;
    const update: Record<string, unknown> = {
      title: next.title,
      content: next.content,
      subtopic: next.subtopic,
      source_note: next.source_note,
    };
    if (contentChanged) {
      const vec = await embedText(`${next.title}\n\n${next.content}`);
      update.embedding = vectorLiteral(vec);
    }
    const { error: upErr } = await supabase.from("rag_documents").update(update).eq("id", p.documentId);
    if (upErr) return { ok: false, error: `update: ${upErr.message}` };

    const { data: lastRev } = await supabase
      .from("rag_document_revisions")
      .select("revision_number")
      .eq("document_id", p.documentId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const revisionNumber = (lastRev?.revision_number ?? 0) + 1;

    const { error: revErr } = await supabase.from("rag_document_revisions").insert({
      document_id: p.documentId,
      revision_number: revisionNumber,
      title: next.title,
      content: next.content,
      source: existing.source,
      source_url: existing.source_url,
      source_note: next.source_note,
      authoritative: existing.authoritative,
      needs_review: existing.needs_review,
      change_kind: "edit",
      change_summary: p.change_summary,
      changed_by: userId,
    });
    if (revErr) return { ok: false, error: `revision: ${revErr.message}` };
    return { ok: true, documentId: p.documentId, revisionNumber };
  }

  // retire
  const { data: existing, error: getErr } = await supabase
    .from("rag_documents")
    .select("title, content, source, source_url, source_note, authoritative, needs_review, scope, scope_id, retired_at")
    .eq("id", p.documentId)
    .maybeSingle();
  if (getErr) return { ok: false, error: `lookup: ${getErr.message}` };
  if (!existing) return { ok: false, error: `no note with id ${p.documentId}` };
  if (existing.scope !== "playbook" || existing.scope_id !== args.playbookId) {
    return { ok: false, error: "note doesn't belong to this playbook" };
  }
  if (existing.retired_at) return { ok: false, error: "note already retired" };

  const { error: upErr } = await supabase
    .from("rag_documents")
    .update({ retired_at: new Date().toISOString() })
    .eq("id", p.documentId);
  if (upErr) return { ok: false, error: `retire: ${upErr.message}` };

  const { data: lastRev } = await supabase
    .from("rag_document_revisions")
    .select("revision_number")
    .eq("document_id", p.documentId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const revisionNumber = (lastRev?.revision_number ?? 0) + 1;

  const { error: revErr } = await supabase.from("rag_document_revisions").insert({
    document_id: p.documentId,
    revision_number: revisionNumber,
    title: existing.title,
    content: existing.content,
    source: existing.source,
    source_url: existing.source_url,
    source_note: existing.source_note,
    authoritative: existing.authoritative,
    needs_review: existing.needs_review,
    change_kind: "retire",
    change_summary: p.change_summary,
    changed_by: userId,
  });
  if (revErr) return { ok: false, error: `revision: ${revErr.message}` };
  return { ok: true, documentId: p.documentId, revisionNumber };
}
