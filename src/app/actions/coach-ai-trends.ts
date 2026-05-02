"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./admin-guard";

export type DailyTrendBucket = {
  day: string; // ISO date YYYY-MM-DD
  kb_miss: number;
  refusal: number;
  thumbs_down: number;
  thumbs_up: number;
};

export type TopMissTopic = { topic: string; count: number };
export type TopRefusalReason = { reason: string; count: number };

export type FeedbackTrends = {
  windowDays: number;
  totals: {
    kb_miss: number;
    refusal: number;
    thumbs_down: number;
    thumbs_up: number;
    clusters_pending: number;
    clusters_approved: number;
    clusters_rejected: number;
  };
  byDay: DailyTrendBucket[];
  topMissTopics: TopMissTopic[];
  topRefusalReasons: TopRefusalReason[];
};

export async function getCoachAiFeedbackTrendsAction(
  windowDays = 30,
): Promise<{ ok: true; trends: FeedbackTrends } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - windowDays);
  const startIso = start.toISOString();

  const [missesRes, refusalsRes, negRes, posRes, clustersRes] = await Promise.all([
    supabase
      .from("coach_ai_kb_misses")
      .select("topic, created_at")
      .gte("created_at", startIso)
      .limit(10000),
    supabase
      .from("coach_ai_refusals")
      .select("refusal_reason, created_at")
      .gte("created_at", startIso)
      .limit(10000),
    supabase
      .from("coach_ai_negative_feedback")
      .select("created_at")
      .gte("created_at", startIso)
      .limit(10000),
    supabase
      .from("coach_ai_positive_feedback")
      .select("created_at")
      .gte("created_at", startIso)
      .limit(10000),
    supabase
      .from("coach_ai_feedback_clusters")
      .select("status")
      .gte("created_at", startIso)
      .limit(10000),
  ]);
  for (const r of [missesRes, refusalsRes, negRes, posRes, clustersRes]) {
    if (r.error) return { ok: false, error: r.error.message };
  }

  const misses = (missesRes.data ?? []) as { topic: string; created_at: string }[];
  const refusals = (refusalsRes.data ?? []) as { refusal_reason: string; created_at: string }[];
  const negatives = (negRes.data ?? []) as { created_at: string }[];
  const positives = (posRes.data ?? []) as { created_at: string }[];
  const clusters = (clustersRes.data ?? []) as { status: "pending" | "approved" | "rejected" }[];

  // Build day buckets covering the window so empty days render as zero rows.
  const buckets = new Map<string, DailyTrendBucket>();
  for (let i = 0; i <= windowDays; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (windowDays - i));
    const k = d.toISOString().slice(0, 10);
    buckets.set(k, { day: k, kb_miss: 0, refusal: 0, thumbs_down: 0, thumbs_up: 0 });
  }
  function bump(iso: string, key: keyof Omit<DailyTrendBucket, "day">) {
    const k = iso.slice(0, 10);
    const b = buckets.get(k);
    if (b) b[key] += 1;
  }
  misses.forEach((r) => bump(r.created_at, "kb_miss"));
  refusals.forEach((r) => bump(r.created_at, "refusal"));
  negatives.forEach((r) => bump(r.created_at, "thumbs_down"));
  positives.forEach((r) => bump(r.created_at, "thumbs_up"));

  const topicCounts = new Map<string, number>();
  for (const r of misses) {
    if (!r.topic) continue;
    topicCounts.set(r.topic, (topicCounts.get(r.topic) ?? 0) + 1);
  }
  const reasonCounts = new Map<string, number>();
  for (const r of refusals) {
    const reason = r.refusal_reason || "unknown";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const topMissTopics = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const topRefusalReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    ok: true,
    trends: {
      windowDays,
      totals: {
        kb_miss: misses.length,
        refusal: refusals.length,
        thumbs_down: negatives.length,
        thumbs_up: positives.length,
        clusters_pending: clusters.filter((c) => c.status === "pending").length,
        clusters_approved: clusters.filter((c) => c.status === "approved").length,
        clusters_rejected: clusters.filter((c) => c.status === "rejected").length,
      },
      byDay: Array.from(buckets.values()),
      topMissTopics,
      topRefusalReasons,
    },
  };
}
