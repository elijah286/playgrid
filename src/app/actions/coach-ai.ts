"use server";

import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/coach-ai/agent";
import type { ChatMessage, ContentBlock } from "@/lib/coach-ai/llm";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import type { ToolContext } from "@/lib/coach-ai/tools";

export type CoachAiTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: string[] };

type ChatRequest = {
  /** Prior turns from the UI (no tool internals — just user/assistant text). */
  history: CoachAiTurn[];
  userMessage: string;
  /** Optional playbook to anchor retrieval. */
  playbookId?: string | null;
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

async function assertCoachAiAvailable(): Promise<{ ok: true } | { ok: false; error: string }> {
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
  return { ok: true };
}

async function loadToolContext(playbookId: string | null): Promise<ToolContext> {
  if (!playbookId) {
    return {
      playbookId: null,
      sportVariant: null,
      gameLevel: null,
      sanctioningBody: null,
      ageDivision: null,
    };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("playbooks")
    .select("sport_variant, game_level, sanctioning_body, age_division")
    .eq("id", playbookId)
    .maybeSingle();
  return {
    playbookId,
    sportVariant: (data?.sport_variant as string | null) ?? null,
    gameLevel: (data?.game_level as string | null) ?? null,
    sanctioningBody: (data?.sanctioning_body as string | null) ?? null,
    ageDivision: (data?.age_division as string | null) ?? null,
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
  const gate = await assertCoachAiAvailable();
  if (!gate.ok) return { ok: false, error: gate.error };

  const text = req.userMessage.trim();
  if (!text) return { ok: false, error: "Empty message." };

  try {
    const ctx = await loadToolContext(req.playbookId ?? null);
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
