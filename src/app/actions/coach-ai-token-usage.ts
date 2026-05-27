"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./admin-guard";

export type CoachAiTokenUsageRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: string | null;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  lastActivity: string | null;
  contextBreakdown: Record<string, number>;
};

export type CoachAiTokenUsageSummary =
  | {
      ok: true;
      rows: CoachAiTokenUsageRow[];
      totals: {
        costMicros: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        activeUsers: number;
      };
      monthLabel: string;
    }
  | { ok: false; error: string };

/**
 * Per-user Coach Cal token usage + cost for the current calendar month.
 * Admin only. The numbers are raw Anthropic API spend, which is the
 * right input for tuning per-user caps — not the same thing as the
 * message-count meter coaches see.
 */
export async function listCoachAiTokenUsageAction(): Promise<CoachAiTokenUsageSummary> {
  await requireAdmin();
  const admin = createServiceRoleClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("coach_ai_token_usage")
    .select(
      "user_id, occurred_at, context, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, cost_micros",
    )
    .gte("occurred_at", monthStart.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(50_000);
  if (error) return { ok: false, error: error.message };

  type Agg = Omit<CoachAiTokenUsageRow, "email" | "displayName" | "role">;
  const byUser = new Map<string, Agg>();
  for (const r of data ?? []) {
    const userId = r.user_id as string;
    const occurredAt = r.occurred_at as string;
    const ctx = (r.context as string) ?? "chat";
    const cost = Number(r.cost_micros ?? 0);
    const prev =
      byUser.get(userId) ??
      ({
        userId,
        costMicros: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        lastActivity: null,
        contextBreakdown: {},
      } as Agg);
    prev.costMicros += cost;
    prev.inputTokens += Number(r.input_tokens ?? 0);
    prev.outputTokens += Number(r.output_tokens ?? 0);
    prev.cacheReadTokens += Number(r.cache_read_input_tokens ?? 0);
    prev.cacheWriteTokens += Number(r.cache_creation_input_tokens ?? 0);
    prev.contextBreakdown[ctx] = (prev.contextBreakdown[ctx] ?? 0) + cost;
    if (!prev.lastActivity || occurredAt > prev.lastActivity) {
      prev.lastActivity = occurredAt;
    }
    byUser.set(userId, prev);
  }

  const ids = [...byUser.keys()];
  const info = await resolveUserInfo(ids);
  const rows: CoachAiTokenUsageRow[] = ids.map((id) => {
    const agg = byUser.get(id)!;
    const u = info.get(id);
    return {
      ...agg,
      email: u?.email ?? null,
      displayName: u?.displayName ?? null,
      role: u?.role ?? null,
    };
  });
  rows.sort((a, b) => b.costMicros - a.costMicros);

  const totals = rows.reduce(
    (acc, r) => ({
      costMicros: acc.costMicros + r.costMicros,
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + r.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + r.cacheWriteTokens,
      activeUsers: acc.activeUsers + 1,
    }),
    {
      costMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      activeUsers: 0,
    },
  );

  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return { ok: true, rows, totals, monthLabel };
}

type UserInfo = { email: string | null; displayName: string | null; role: string | null };

async function resolveUserInfo(ids: string[]): Promise<Map<string, UserInfo>> {
  const out = new Map<string, UserInfo>();
  if (ids.length === 0) return out;
  const admin = createServiceRoleClient();
  const [{ data: profiles }, authRes] = await Promise.all([
    admin.from("profiles").select("id, display_name, role").in("id", ids),
    admin.auth.admin.listUsers({ perPage: 1000, page: 1 }),
  ]);
  const profById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        displayName: (p as { display_name: string | null }).display_name,
        role: (p as { role: string | null }).role,
      },
    ]),
  );
  const emailById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? null]),
  );
  for (const id of ids) {
    const p = profById.get(id);
    out.set(id, {
      email: emailById.get(id) ?? null,
      displayName: p?.displayName ?? null,
      role: p?.role ?? null,
    });
  }
  return out;
}
