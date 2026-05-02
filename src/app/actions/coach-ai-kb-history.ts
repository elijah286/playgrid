"use server";

import { createClient } from "@/lib/supabase/server";
import { embedText, vectorLiteral } from "@/lib/coach-ai/embed";
import { requireAdmin } from "./admin-guard";

export type KbRevisionRow = {
  id: string;
  document_id: string;
  document_title: string;
  document_topic: string;
  document_subtopic: string | null;
  document_retired_at: string | null;
  revision_number: number;
  title: string;
  content: string;
  change_kind: "create" | "edit" | "verify" | "retire" | "restore";
  change_summary: string | null;
  changed_by: string | null;
  created_at: string;
  is_latest: boolean;
};

export async function listKbHistoryAction(
  limit = 100,
): Promise<{ ok: true; items: KbRevisionRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rag_document_revisions")
    .select(
      "id, document_id, revision_number, title, content, change_kind, change_summary, changed_by, created_at, document:rag_documents!inner(title, topic, subtopic, retired_at)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };

  type Row = {
    id: string;
    document_id: string;
    revision_number: number;
    title: string;
    content: string;
    change_kind: KbRevisionRow["change_kind"];
    change_summary: string | null;
    changed_by: string | null;
    created_at: string;
    document: { title: string; topic: string; subtopic: string | null; retired_at: string | null };
  };
  const rows = (data ?? []) as unknown as Row[];

  // Compute is_latest by grouping per document_id and finding the max revision_number.
  const maxByDoc = new Map<string, number>();
  for (const r of rows) {
    const cur = maxByDoc.get(r.document_id) ?? 0;
    if (r.revision_number > cur) maxByDoc.set(r.document_id, r.revision_number);
  }

  const items: KbRevisionRow[] = rows.map((r) => ({
    id: r.id,
    document_id: r.document_id,
    document_title: r.document.title,
    document_topic: r.document.topic,
    document_subtopic: r.document.subtopic,
    document_retired_at: r.document.retired_at,
    revision_number: r.revision_number,
    title: r.title,
    content: r.content,
    change_kind: r.change_kind,
    change_summary: r.change_summary,
    changed_by: r.changed_by,
    created_at: r.created_at,
    is_latest: maxByDoc.get(r.document_id) === r.revision_number,
  }));

  return { ok: true, items };
}

export async function revertKbRevisionAction(
  documentId: string,
  toRevisionId: string,
): Promise<{ ok: true; newRevisionNumber: number } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { data: target, error: tErr } = await supabase
    .from("rag_document_revisions")
    .select("title, content, source, source_url, source_note, authoritative, needs_review, revision_number")
    .eq("id", toRevisionId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message };
  if (!target) return { ok: false, error: "Revision not found." };

  const { data: maxRev } = await supabase
    .from("rag_document_revisions")
    .select("revision_number")
    .eq("document_id", documentId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextRev = (maxRev?.revision_number ?? 0) + 1;

  let embedding: number[];
  try {
    embedding = await embedText(`${target.title}\n\n${target.content}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "embedding failed" };
  }

  const { error: upErr } = await supabase
    .from("rag_documents")
    .update({
      title: target.title,
      content: target.content,
      source: target.source,
      source_url: target.source_url,
      source_note: target.source_note,
      authoritative: target.authoritative,
      needs_review: target.needs_review,
      embedding: vectorLiteral(embedding),
      retired_at: null,
    })
    .eq("id", documentId);
  if (upErr) return { ok: false, error: upErr.message };

  const { error: revErr } = await supabase.from("rag_document_revisions").insert({
    document_id: documentId,
    revision_number: nextRev,
    title: target.title,
    content: target.content,
    source: target.source,
    source_url: target.source_url,
    source_note: target.source_note,
    authoritative: target.authoritative,
    needs_review: target.needs_review,
    change_kind: "restore",
    change_summary: `Reverted to revision ${target.revision_number}`,
    changed_by: user.id,
  });
  if (revErr) return { ok: false, error: revErr.message };

  return { ok: true, newRevisionNumber: nextRev };
}
