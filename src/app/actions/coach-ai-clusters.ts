"use server";

import { createClient } from "@/lib/supabase/server";
import { embedText, vectorLiteral } from "@/lib/coach-ai/embed";
import { generateFeedbackClusters } from "@/lib/coach-ai/feedback-clusters";
import { requireAdmin } from "./admin-guard";

export type ClusterRow = {
  id: string;
  topic: string;
  draft_title: string;
  draft_content: string;
  draft_subtopic: string | null;
  suggested_topic: "rules" | "scheme" | "terminology" | "tactics";
  suggested_sport_variant: string | null;
  suggested_game_level: string | null;
  suggested_sanctioning_body: string | null;
  suggested_age_division: string | null;
  signal_kb_miss: number;
  signal_refusal: number;
  signal_thumbs_dn: number;
  cluster_size: number;
  sample_prompts: string[];
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  rejection_reason: string | null;
  approved_kb_id: string | null;
  signal_window_start: string;
  signal_window_end: string;
  created_at: string;
};

export async function listFeedbackClustersAction(
  status: "pending" | "all" = "pending",
): Promise<{ ok: true; items: ClusterRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("coach_ai_feedback_clusters")
    .select(
      "id, topic, draft_title, draft_content, draft_subtopic, suggested_topic, suggested_sport_variant, suggested_game_level, suggested_sanctioning_body, suggested_age_division, signal_kb_miss, signal_refusal, signal_thumbs_dn, cluster_size, sample_prompts, status, reviewed_at, rejection_reason, approved_kb_id, signal_window_start, signal_window_end, created_at",
    )
    .order("cluster_size", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "pending") q = q.eq("status", "pending");
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as ClusterRow[] };
}

export async function refreshFeedbackClustersAction(): Promise<
  { ok: true; signalsConsidered: number; clustersDrafted: number } | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    const supabase = await createClient();
    const result = await generateFeedbackClusters(supabase);
    return {
      ok: true,
      signalsConsidered: result.signalsConsidered,
      clustersDrafted: result.clustersDrafted,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "cluster refresh failed" };
  }
}

export type ClusterEdits = {
  draft_title?: string;
  draft_content?: string;
  draft_subtopic?: string | null;
  suggested_topic?: "rules" | "scheme" | "terminology" | "tactics";
  suggested_sport_variant?: string | null;
  suggested_game_level?: string | null;
  suggested_sanctioning_body?: string | null;
  suggested_age_division?: string | null;
};

export async function approveFeedbackClusterAction(
  id: string,
  edits: ClusterEdits,
): Promise<{ ok: true; kbId: string } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  const supabase = await createClient();
  const { data: cluster, error: getErr } = await supabase
    .from("coach_ai_feedback_clusters")
    .select(
      "id, status, draft_title, draft_content, draft_subtopic, suggested_topic, suggested_sport_variant, suggested_game_level, suggested_sanctioning_body, suggested_age_division",
    )
    .eq("id", id)
    .maybeSingle();
  if (getErr) return { ok: false, error: getErr.message };
  if (!cluster) return { ok: false, error: "Cluster not found." };
  if (cluster.status !== "pending") return { ok: false, error: `Cluster is ${cluster.status}.` };

  const title = (edits.draft_title ?? cluster.draft_title).trim();
  const content = (edits.draft_content ?? cluster.draft_content).trim();
  if (!title || !content) return { ok: false, error: "Title and content are required." };

  const subtopic = edits.draft_subtopic !== undefined ? edits.draft_subtopic : cluster.draft_subtopic;
  const topic = edits.suggested_topic ?? cluster.suggested_topic;
  const sport_variant =
    edits.suggested_sport_variant !== undefined
      ? edits.suggested_sport_variant
      : cluster.suggested_sport_variant;
  const game_level =
    edits.suggested_game_level !== undefined ? edits.suggested_game_level : cluster.suggested_game_level;
  const sanctioning_body =
    edits.suggested_sanctioning_body !== undefined
      ? edits.suggested_sanctioning_body
      : cluster.suggested_sanctioning_body;
  const age_division =
    edits.suggested_age_division !== undefined
      ? edits.suggested_age_division
      : cluster.suggested_age_division;

  let embedding: number[];
  try {
    embedding = await embedText(`${title}\n\n${content}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "embedding failed" };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("rag_documents")
    .insert({
      scope: "global",
      scope_id: null,
      topic,
      subtopic: subtopic || null,
      title,
      content,
      sport_variant: sport_variant || null,
      game_level: game_level || null,
      sanctioning_body: sanctioning_body || null,
      age_division: age_division || null,
      source: "admin_chat",
      source_url: null,
      source_note: `Drafted from feedback cluster ${id}`,
      authoritative: false,
      needs_review: true,
      created_by: user.id,
      embedding: vectorLiteral(embedding),
    })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  await supabase.from("rag_document_revisions").insert({
    document_id: inserted.id,
    revision_number: 1,
    title,
    content,
    source: "admin_chat",
    source_url: null,
    source_note: `Drafted from feedback cluster ${id}`,
    authoritative: false,
    needs_review: true,
    change_kind: "create",
    change_summary: `Approved from cluster: ${cluster.draft_title}`,
    changed_by: user.id,
  });

  const { error: upErr } = await supabase
    .from("coach_ai_feedback_clusters")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      approved_kb_id: inserted.id,
    })
    .eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, kbId: inserted.id };
}

export async function rejectFeedbackClusterAction(
  id: string,
  reason: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_ai_feedback_clusters")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: reason ? reason.slice(0, 500) : null,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
