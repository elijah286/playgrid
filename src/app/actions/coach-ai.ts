"use server";

import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/coach-ai/agent";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import type { CoachAiMode, ToolContext } from "@/lib/coach-ai/tools";
import type { NoteProposal } from "@/lib/coach-ai/playbook-tools";
import { normalizePlaybookSettings } from "@/domain/playbook/settings";

export type PlaybookChip = { id: string; name: string; color: string | null; season: string | null };

/** Per-proposal save state, keyed by proposal.proposalId. Persisted in
 *  the assistant turn so a refresh doesn't re-show "Save" on a chip the
 *  coach already committed (which would either error or duplicate). */
export type NoteProposalSavedState =
  | { status: "saved"; documentId: string; revisionNumber: number }
  | { status: "dismissed" };

export type CoachAiTurn =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      toolCalls: string[];
      playbookChips?: PlaybookChip[] | null;
      noteProposals?: NoteProposal[] | null;
      /** Map from NoteProposal.proposalId → save/dismiss state. */
      noteProposalState?: Record<string, NoteProposalSavedState> | null;
    };

type ChatRequest = {
  /** Prior turns from the UI (no tool internals — just user/assistant text). */
  history: CoachAiTurn[];
  userMessage: string;
  /** Optional playbook to anchor retrieval. */
  playbookId?: string | null;
  /** "admin_training" only honored if caller is a site admin. */
  mode?: CoachAiMode;
  /** Caller's IANA timezone (from the browser). */
  timezone?: string | null;
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
  const entitlement = await getCurrentEntitlement();
  const isEntitled = isAdmin || (entitlement?.tier ?? "free") === "coach_ai";
  if (!isEntitled) return { ok: false, error: "Coach Cal requires a Coach Pro subscription." };
  return { ok: true, isAdmin };
}

async function loadToolContext(
  playbookId: string | null,
  isAdmin: boolean,
  mode: CoachAiMode,
  timezone: string | null,
): Promise<ToolContext> {
  if (!playbookId) {
    return {
      playbookId: null,
      playbookName: null,
      sportVariant: null,
      gameLevel: null,
      sanctioningBody: null,
      ageDivision: null,
      playbookSettings: null,
      isAdmin,
      canEditPlaybook: false,
      mode,
      timezone,
      playId: null,
      playName: null,
      playFormation: null,
      playDiagramText: null,
      playDiagramRecap: null,
    };
  }
  const supabase = await createClient();
  const [{ data }, { data: canEdit }] = await Promise.all([
    supabase
      .from("playbooks")
      .select("name, sport_variant, game_level, sanctioning_body, age_division, settings, custom_offense_count")
      .eq("id", playbookId)
      .maybeSingle(),
    supabase.rpc("can_edit_playbook", { pb: playbookId }),
  ]);
  const variant = (data?.sport_variant as string | null) ?? null;
  const settings = variant
    ? normalizePlaybookSettings(
        data?.settings,
        variant as Parameters<typeof normalizePlaybookSettings>[1],
        (data?.custom_offense_count as number | null) ?? null,
      )
    : null;
  return {
    playbookId,
    playbookName: (data?.name as string | null) ?? null,
    sportVariant: variant,
    gameLevel: (data?.game_level as string | null) ?? null,
    sanctioningBody: (data?.sanctioning_body as string | null) ?? null,
    ageDivision: (data?.age_division as string | null) ?? null,
    playbookSettings: settings,
    isAdmin,
    canEditPlaybook: Boolean(canEdit),
    mode,
    timezone,
    playId: null,
    playName: null,
    playFormation: null,
    playDiagramText: null,
    playDiagramRecap: null,
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
    req.mode === "admin_training" ? "admin_training" : "normal";

  try {
    const tz = typeof req.timezone === "string" && req.timezone ? req.timezone : null;
    const probe = await loadToolContext(req.playbookId ?? null, gate.isAdmin, "normal", tz);
    const mode: CoachAiMode =
      requestedMode === "admin_training" && gate.isAdmin ? "admin_training" : "normal";
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
