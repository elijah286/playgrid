/**
 * Coach AI feedback clustering — turns raw failure signals (KB misses,
 * refusals, thumbs-down) into reviewable clusters with LLM-drafted KB
 * chunks.
 *
 * Run from a cron route (`/api/coach-ai/cluster-failures/run`) or on-demand
 * from the site-admin "Refresh clusters" button. Uses the service-role
 * client because cron runs unauthenticated; the on-demand server action
 * checks `requireAdmin()` separately.
 *
 * Anti-patterns we avoid (per AGENTS.md Rule 5 — make it impossible, then
 * validate):
 *   - We never auto-write into rag_documents from this job. Approval is
 *     human-in-loop via the admin queue. The job only creates DRAFTS.
 *   - We never auto-merge cross-team. Drafts are global by default; the
 *     admin can downscope at approval time, but the job never widens scope
 *     by itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStoredClaudeApiKey } from "@/lib/site/claude-key";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

const DEFAULT_WINDOW_DAYS = 30;
const MAX_SIGNALS_PER_RUN = 200;
const MIN_CLUSTER_SIZE = 2;

type Signal = {
  kind: "kb_miss" | "refusal" | "thumbs_down";
  id: string;
  prompt: string;
  reason: string | null;
  facets: {
    sport_variant: string | null;
    sanctioning_body: string | null;
    game_level: string | null;
    age_division: string | null;
  };
  created_at: string;
};

type DraftCluster = {
  topic: string;
  draft_title: string;
  draft_content: string;
  draft_subtopic: string | null;
  suggested_topic: "rules" | "scheme" | "terminology" | "tactics";
  suggested_sport_variant: string | null;
  suggested_game_level: string | null;
  suggested_sanctioning_body: string | null;
  suggested_age_division: string | null;
  sample_prompts: string[];
  signal_ids: { kind: Signal["kind"]; id: string }[];
};

export type ClusterRunResult = {
  signalsConsidered: number;
  clustersDrafted: number;
  windowStart: string;
  windowEnd: string;
};

export async function generateFeedbackClusters(
  supabase: SupabaseClient,
  opts: { windowDays?: number } = {},
): Promise<ClusterRunResult> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // Gather signals already represented by an existing cluster so we don't
  // re-cluster them. Only "pending" matters — approved/rejected clusters
  // mean the admin has acted on those signals already.
  const { data: existing } = await supabase
    .from("coach_ai_feedback_clusters")
    .select("signal_window_end, status")
    .gte("created_at", windowStart.toISOString());
  const lastDrafted = (existing ?? [])
    .filter((r) => r.status === "pending")
    .map((r) => new Date(r.signal_window_end as string).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  const effectiveStart = new Date(Math.max(windowStart.getTime(), lastDrafted));

  const signals = await collectSignals(supabase, effectiveStart, windowEnd);
  if (signals.length < MIN_CLUSTER_SIZE) {
    return {
      signalsConsidered: signals.length,
      clustersDrafted: 0,
      windowStart: effectiveStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  const drafts = await draftClustersWithLlm(signals);
  let drafted = 0;
  for (const d of drafts) {
    if (d.sample_prompts.length < MIN_CLUSTER_SIZE) continue;
    const counts = { kb_miss: 0, refusal: 0, thumbs_down: 0 };
    for (const ref of d.signal_ids) counts[ref.kind] = (counts[ref.kind] ?? 0) + 1;
    const { error } = await supabase.from("coach_ai_feedback_clusters").insert({
      topic: d.topic.slice(0, 200),
      draft_title: d.draft_title.slice(0, 200),
      draft_content: d.draft_content.slice(0, 8000),
      draft_subtopic: d.draft_subtopic?.slice(0, 100) ?? null,
      suggested_topic: d.suggested_topic,
      suggested_sport_variant: d.suggested_sport_variant,
      suggested_game_level: d.suggested_game_level,
      suggested_sanctioning_body: d.suggested_sanctioning_body,
      suggested_age_division: d.suggested_age_division,
      signal_kb_miss: counts.kb_miss,
      signal_refusal: counts.refusal,
      signal_thumbs_dn: counts.thumbs_down,
      cluster_size: d.signal_ids.length,
      sample_prompts: d.sample_prompts.slice(0, 5),
      signal_window_start: effectiveStart.toISOString(),
      signal_window_end: windowEnd.toISOString(),
    });
    if (!error) drafted += 1;
  }

  return {
    signalsConsidered: signals.length,
    clustersDrafted: drafted,
    windowStart: effectiveStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

async function collectSignals(
  supabase: SupabaseClient,
  start: Date,
  end: Date,
): Promise<Signal[]> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const [misses, refusals, negatives] = await Promise.all([
    supabase
      .from("coach_ai_kb_misses")
      .select("id, user_question, reason, sport_variant, sanctioning_body, game_level, age_division, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .is("reviewed_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_SIGNALS_PER_RUN),
    supabase
      .from("coach_ai_refusals")
      .select("id, user_request, refusal_reason, sport_variant, sanctioning_body, game_level, age_division, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .is("reviewed_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_SIGNALS_PER_RUN),
    supabase
      .from("coach_ai_negative_feedback")
      .select("id, user_message, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(MAX_SIGNALS_PER_RUN),
  ]);

  const out: Signal[] = [];
  for (const row of (misses.data ?? []) as Array<{
    id: string;
    user_question: string;
    reason: string;
    sport_variant: string | null;
    sanctioning_body: string | null;
    game_level: string | null;
    age_division: string | null;
    created_at: string;
  }>) {
    out.push({
      kind: "kb_miss",
      id: row.id,
      prompt: row.user_question,
      reason: row.reason,
      facets: {
        sport_variant: row.sport_variant,
        sanctioning_body: row.sanctioning_body,
        game_level: row.game_level,
        age_division: row.age_division,
      },
      created_at: row.created_at,
    });
  }
  for (const row of (refusals.data ?? []) as Array<{
    id: string;
    user_request: string;
    refusal_reason: string;
    sport_variant: string | null;
    sanctioning_body: string | null;
    game_level: string | null;
    age_division: string | null;
    created_at: string;
  }>) {
    out.push({
      kind: "refusal",
      id: row.id,
      prompt: row.user_request,
      reason: row.refusal_reason,
      facets: {
        sport_variant: row.sport_variant,
        sanctioning_body: row.sanctioning_body,
        game_level: row.game_level,
        age_division: row.age_division,
      },
      created_at: row.created_at,
    });
  }
  for (const row of (negatives.data ?? []) as Array<{
    id: string;
    user_message: string;
    created_at: string;
  }>) {
    out.push({
      kind: "thumbs_down",
      id: row.id,
      prompt: row.user_message,
      reason: null,
      facets: {
        sport_variant: null,
        sanctioning_body: null,
        game_level: null,
        age_division: null,
      },
      created_at: row.created_at,
    });
  }
  return out;
}

async function draftClustersWithLlm(signals: Signal[]): Promise<DraftCluster[]> {
  const apiKey = await getStoredClaudeApiKey();
  if (!apiKey) {
    throw new Error("Claude API key required to cluster Coach AI feedback");
  }

  const sigList = signals
    .map((s, i) => {
      const facets = [s.facets.sport_variant, s.facets.sanctioning_body, s.facets.game_level, s.facets.age_division]
        .filter(Boolean)
        .join("/");
      return `${i + 1}. [${s.kind}${facets ? ` ${facets}` : ""}] ${truncate(stripPii(s.prompt), 240)}`;
    })
    .join("\n");

  const system = [
    "You cluster Coach AI failure signals into reviewable groups for a site administrator.",
    "Each cluster represents a recurring topic where Coach AI gave a poor answer or refused. The goal is to draft a candidate Knowledge Base chunk that, if approved, would let Coach AI answer that topic correctly next time.",
    "",
    "Rules:",
    `- Only emit clusters with at least ${MIN_CLUSTER_SIZE} signals.`,
    "- Do not invent topics that aren't supported by the signals you were shown.",
    "- Anonymize sample_prompts: strip names, team names, league names, and any personal identifiers. Keep the football question.",
    "- draft_content should be a self-contained KB chunk (3-8 sentences) written in the voice of an experienced football coach. State facts; do not say 'the user asked' or reference the cluster.",
    "- suggested_topic must be one of: rules, scheme, terminology, tactics.",
    "- For sport_variant/game_level/sanctioning_body/age_division: only set a value when the signal facets clearly point to one. Otherwise null (means the chunk applies broadly).",
    "- If a signal looks like a transient bug or one-off complaint with no learnable lesson, exclude it.",
    "",
    "Respond with JSON only, matching this shape:",
    "{ \"clusters\": [ { \"topic\": string, \"draft_title\": string, \"draft_content\": string, \"draft_subtopic\": string|null, \"suggested_topic\": \"rules\"|\"scheme\"|\"terminology\"|\"tactics\", \"suggested_sport_variant\": string|null, \"suggested_game_level\": string|null, \"suggested_sanctioning_body\": string|null, \"suggested_age_division\": string|null, \"sample_prompts\": string[], \"signal_indices\": number[] } ] }",
  ].join("\n");

  const user = `Signals (numbered, with kind and facets):\n${sigList}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = json.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = parseJson(text);
  if (!parsed || !Array.isArray(parsed.clusters)) return [];

  const drafts: DraftCluster[] = [];
  for (const raw of parsed.clusters) {
    const c = raw as Record<string, unknown>;
    if (!Array.isArray(c.signal_indices)) continue;
    const refs: { kind: Signal["kind"]; id: string }[] = [];
    for (const idx of c.signal_indices as unknown[]) {
      const s = signals[Number(idx) - 1];
      if (s) refs.push({ kind: s.kind, id: s.id });
    }
    if (refs.length < MIN_CLUSTER_SIZE) continue;
    const suggested = String(c.suggested_topic ?? "tactics");
    drafts.push({
      topic: String(c.topic ?? "untitled"),
      draft_title: String(c.draft_title ?? c.topic ?? "Untitled"),
      draft_content: String(c.draft_content ?? ""),
      draft_subtopic: c.draft_subtopic ? String(c.draft_subtopic) : null,
      suggested_topic: (["rules", "scheme", "terminology", "tactics"] as const).includes(
        suggested as "rules" | "scheme" | "terminology" | "tactics",
      )
        ? (suggested as DraftCluster["suggested_topic"])
        : "tactics",
      suggested_sport_variant: c.suggested_sport_variant ? String(c.suggested_sport_variant) : null,
      suggested_game_level: c.suggested_game_level ? String(c.suggested_game_level) : null,
      suggested_sanctioning_body: c.suggested_sanctioning_body
        ? String(c.suggested_sanctioning_body)
        : null,
      suggested_age_division: c.suggested_age_division ? String(c.suggested_age_division) : null,
      sample_prompts: Array.isArray(c.sample_prompts)
        ? (c.sample_prompts as unknown[]).map((p) => stripPii(String(p)))
        : [],
      signal_ids: refs,
    });
  }
  return drafts;
}

function parseJson(text: string): { clusters?: unknown[] } | null {
  // Tolerant JSON extraction — model may wrap output in prose or fences.
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fence ? fence[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const URL_RE = /https?:\/\/\S+/gi;

function stripPii(s: string): string {
  return s.replace(EMAIL_RE, "[email]").replace(URL_RE, "[url]");
}
