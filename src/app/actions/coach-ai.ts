"use server";

import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/coach-ai/agent";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import type { CoachAiMode, ToolContext } from "@/lib/coach-ai/tools";

export type PlaybookChip = { id: string; name: string; color: string | null; season: string | null };

export type CoachAiTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: string[]; playbookChips?: PlaybookChip[] | null };

type ChatRequest = {
  /** Prior turns from the UI (no tool internals — just user/assistant text). */
  history: CoachAiTurn[];
  userMessage: string;
  /** Optional playbook to anchor retrieval. */
  playbookId?: string | null;
  /** "admin_training" only honored if caller is a site admin. */
  mode?: CoachAiMode;
};

type ChatResponse =
  | {
      ok: true;
      assistantText: string;
      toolCalls: string[];
      provider: "openai" | "claude";
      modelId: string;
    }
  | { ok: false; error: string };

async function loadCallerInfo(): Promise<
  | { ok: true; isAdmin: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";
  const beta = await getBetaFeatures();
  const available = isBetaFeatureAvailable(beta.coach_ai, { isAdmin, isEntitled: true });
  if (!available) return { ok: false, error: "Coach AI is not enabled for your account." };
  return { ok: true, isAdmin };
}

async function loadToolContext(
  playbookId: string | null,
  isAdmin: boolean,
  mode: CoachAiMode,
): Promise<ToolContext> {
  if (!playbookId) {
    return {
      playbookId: null,
      playbookName: null,
      sportVariant: null,
      gameLevel: null,
      sanctioningBody: null,
      ageDivision: null,
      isAdmin,
      canEditPlaybook: false,
      mode,
    };
  }
  const supabase = await createClient();
  const [{ data }, { data: canEdit }] = await Promise.all([
    supabase
      .from("playbooks")
      .select("name, sport_variant, game_level, sanctioning_body, age_division")
      .eq("id", playbookId)
      .maybeSingle(),
    supabase.rpc("can_edit_playbook", { pb: playbookId }),
  ]);
  return {
    playbookId,
    playbookName: (data?.name as string | null) ?? null,
    sportVariant: (data?.sport_variant as string | null) ?? null,
    gameLevel: (data?.game_level as string | null) ?? null,
    sanctioningBody: (data?.sanctioning_body as string | null) ?? null,
    ageDivision: (data?.age_division as string | null) ?? null,
    isAdmin,
    canEditPlaybook: Boolean(canEdit),
    mode,
  };
}

function turnsToHistory(turns: CoachAiTurn[]): ChatMessage[] {
  return turns.map((t) =>
    t.role === "user"
      ? ({ role: "user", content: t.text } satisfies ChatMessage)
      : ({ role: "assistant", content: [{ type: "text", text: t.text } satisfies ContentBlock] } satisfies ChatMessage),
  );
}

export async function chatCoachAiAction(req: ChatRequest): Promise<ChatResponse> {
  const gate = await loadCallerInfo();
  if (!gate.ok) return { ok: false, error: gate.error };

  const text = req.userMessage.trim();
  if (!text) return { ok: false, error: "Empty message." };

  const requestedMode: CoachAiMode =
    req.mode === "admin_training" ? "admin_training"
      : req.mode === "playbook_training" ? "playbook_training"
      : "normal";

  try {
    // Resolve effective mode against actual permissions. Pre-load ctx with
    // mode='normal' first so we can read canEditPlaybook safely, then upgrade.
    const probe = await loadToolContext(req.playbookId ?? null, gate.isAdmin, "normal");
    let mode: CoachAiMode = "normal";
    if (requestedMode === "admin_training" && gate.isAdmin) mode = "admin_training";
    else if (
      requestedMode === "playbook_training" &&
      probe.playbookId &&
      probe.canEditPlaybook
    ) {
      mode = "playbook_training";
    }
    const ctx: ToolContext = { ...probe, mode };
    const history: ChatMessage[] = [
      ...turnsToHistory(req.history),
      { role: "user", content: text },
    ];
    const result = await runAgent(history, ctx);
    return {
      ok: true,
      assistantText: result.finalText,
      toolCalls: result.toolCalls,
      provider: result.provider,
      modelId: result.modelId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Coach AI failed.";
    return { ok: false, error: msg };
  }
}

// ─── Admin: backfill embeddings ──────────────────────────────────────────────

export async function backfillRagEmbeddingsAction(): Promise<
  | { ok: true; embedded: number; remaining: number }
  | { ok: false; error: string }
> {
  const gate = await loadCallerInfo();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.isAdmin) return { ok: false, error: "Admin only." };

  try {
    const { embedText, vectorLiteral } = await import("@/lib/coach-ai/embed");
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const admin = createServiceRoleClient();

    const BATCH = 50;
    const { data: rows, error } = await admin
      .from("rag_documents")
      .select("id, title, content")
      .is("embedding", null)
      .is("retired_at", null)
      .limit(BATCH);
    if (error) return { ok: false, error: error.message };
    if (!rows || rows.length === 0) {
      return { ok: true, embedded: 0, remaining: 0 };
    }

    let embedded = 0;
    for (const row of rows) {
      try {
        const vec = await embedText(`${row.title}\n\n${row.content}`);
        const { error: upErr } = await admin
          .from("rag_documents")
          .update({ embedding: vectorLiteral(vec) })
          .eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        embedded++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "embed failed";
        return { ok: false, error: `Failed on row ${row.id}: ${msg}` };
      }
    }

    const { count } = await admin
      .from("rag_documents")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .is("retired_at", null);

    return { ok: true, embedded, remaining: count ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "backfill failed" };
  }
}

export async function ragEmbeddingStatsAction(): Promise<
  | { ok: true; total: number; missing: number }
  | { ok: false; error: string }
> {
  const gate = await loadCallerInfo();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.isAdmin) return { ok: false, error: "Admin only." };

  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const admin = createServiceRoleClient();
    const [{ count: total }, { count: missing }] = await Promise.all([
      admin.from("rag_documents").select("id", { count: "exact", head: true }).is("retired_at", null),
      admin.from("rag_documents").select("id", { count: "exact", head: true }).is("retired_at", null).is("embedding", null),
    ]);
    return { ok: true, total: total ?? 0, missing: missing ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "stats failed" };
  }
}
