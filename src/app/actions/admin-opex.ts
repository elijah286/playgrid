"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStoredAnthropicAdminApiKey } from "@/lib/site/claude-key";
import { getStoredOpenAIAdminApiKey } from "@/lib/site/openai-key";
import {
  fetchAnthropicMonthlyCostCents,
  fetchOpenAIMonthlyCostCents,
} from "@/lib/opex/fetch-costs";

export type OpexCategory =
  | "infra"
  | "ai"
  | "email"
  | "domain"
  | "payments"
  | "dev_accounts"
  | "other";

export type OpexService = {
  id: string;
  slug: string;
  name: string;
  category: OpexCategory;
  website: string | null;
  notes: string | null;
  autoFetch: boolean;
  sortOrder: number;
};

export type OpexEntry = {
  id: string;
  serviceId: string;
  periodMonth: string; // YYYY-MM-DD (first of month)
  amountCentsManual: number | null;
  amountCentsAuto: number | null;
  autoFetchedAt: string | null;
  autoSource: string | null;
  currency: string;
  notes: string | null;
};

async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const };
}

function normalizePeriodMonth(input: string): string | null {
  // Accept YYYY-MM or YYYY-MM-DD; always return first-of-month YYYY-MM-DD.
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(input.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  website: string | null;
  notes: string | null;
  auto_fetch: boolean;
  sort_order: number;
};

type EntryRow = {
  id: string;
  service_id: string;
  period_month: string;
  amount_cents_manual: number | null;
  amount_cents_auto: number | null;
  auto_fetched_at: string | null;
  auto_source: string | null;
  currency: string;
  notes: string | null;
};

function mapService(r: ServiceRow): OpexService {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category as OpexCategory,
    website: r.website,
    notes: r.notes,
    autoFetch: r.auto_fetch,
    sortOrder: r.sort_order,
  };
}

function mapEntry(r: EntryRow): OpexEntry {
  return {
    id: r.id,
    serviceId: r.service_id,
    periodMonth: r.period_month,
    amountCentsManual: r.amount_cents_manual,
    amountCentsAuto: r.amount_cents_auto,
    autoFetchedAt: r.auto_fetched_at,
    autoSource: r.auto_source,
    currency: r.currency,
    notes: r.notes,
  };
}

export async function listOpexServicesAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("opex_services")
      .select("id, slug, name, category, website, notes, auto_fetch, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, services: (data ?? []).map(mapService) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not load services." };
  }
}

export async function listOpexEntriesAction(periodMonth: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const period = normalizePeriodMonth(periodMonth);
  if (!period) return { ok: false as const, error: "Invalid period (use YYYY-MM)." };
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("opex_entries")
      .select("id, service_id, period_month, amount_cents_manual, amount_cents_auto, auto_fetched_at, auto_source, currency, notes")
      .eq("period_month", period);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, entries: (data ?? []).map(mapEntry) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not load entries." };
  }
}

export async function upsertOpexEntryAction(input: {
  serviceId: string;
  periodMonth: string;
  amountCentsManual: number | null;
  notes?: string | null;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const period = normalizePeriodMonth(input.periodMonth);
  if (!period) return { ok: false as const, error: "Invalid period (use YYYY-MM)." };
  if (
    input.amountCentsManual !== null &&
    (!Number.isFinite(input.amountCentsManual) || input.amountCentsManual < 0)
  ) {
    return { ok: false as const, error: "Amount must be a non-negative number." };
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("opex_entries")
      .upsert(
        {
          service_id: input.serviceId,
          period_month: period,
          amount_cents_manual: input.amountCentsManual,
          notes: input.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "service_id,period_month" },
      );
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }
}

async function upsertAutoCost(
  serviceId: string,
  period: string,
  amountCents: number,
  source: string,
) {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("opex_entries")
    .upsert(
      {
        service_id: serviceId,
        period_month: period,
        amount_cents_auto: amountCents,
        auto_fetched_at: new Date().toISOString(),
        auto_source: source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_id,period_month" },
    );
  if (error) throw new Error(error.message);
}

export async function refreshAutoCostsAction(periodMonth: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const period = normalizePeriodMonth(periodMonth);
  if (!period) return { ok: false as const, error: "Invalid period (use YYYY-MM)." };

  const periodDate = new Date(`${period}T00:00:00Z`);
  const results: Array<{ slug: string; ok: boolean; error?: string; amountCents?: number }> = [];

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("opex_services")
      .select("id, slug")
      .eq("auto_fetch", true);
    if (error) return { ok: false as const, error: error.message };

    for (const svc of data ?? []) {
      if (svc.slug === "claude") {
        const key = await getStoredAnthropicAdminApiKey();
        if (!key) {
          results.push({ slug: svc.slug, ok: false, error: "No Anthropic admin key saved." });
          continue;
        }
        const r = await fetchAnthropicMonthlyCostCents(periodDate, key);
        if (!r.ok) {
          results.push({ slug: svc.slug, ok: false, error: r.error });
          continue;
        }
        await upsertAutoCost(svc.id, period, r.amountCents, r.source);
        results.push({ slug: svc.slug, ok: true, amountCents: r.amountCents });
      } else if (svc.slug === "openai") {
        const key = await getStoredOpenAIAdminApiKey();
        if (!key) {
          results.push({ slug: svc.slug, ok: false, error: "No OpenAI admin key saved." });
          continue;
        }
        const r = await fetchOpenAIMonthlyCostCents(periodDate, key);
        if (!r.ok) {
          results.push({ slug: svc.slug, ok: false, error: r.error });
          continue;
        }
        await upsertAutoCost(svc.id, period, r.amountCents, r.source);
        results.push({ slug: svc.slug, ok: true, amountCents: r.amountCents });
      }
    }
    revalidatePath("/settings");
    return { ok: true as const, results };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Refresh failed." };
  }
}

export async function upsertOpexServiceAction(input: {
  id?: string;
  slug: string;
  name: string;
  category: OpexCategory;
  website?: string | null;
  notes?: string | null;
  sortOrder?: number;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  if (!slug || !name) return { ok: false as const, error: "Slug and name are required." };

  try {
    const admin = createServiceRoleClient();
    const payload = {
      slug,
      name,
      category: input.category,
      website: input.website ?? null,
      notes: input.notes ?? null,
      sort_order: input.sortOrder ?? 200,
      updated_at: new Date().toISOString(),
    };
    const q = input.id
      ? admin.from("opex_services").update(payload).eq("id", input.id)
      : admin.from("opex_services").insert({ ...payload });
    const { error } = await q;
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed." };
  }
}

export async function deleteOpexServiceAction(id: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("opex_services").delete().eq("id", id);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Delete failed." };
  }
}
