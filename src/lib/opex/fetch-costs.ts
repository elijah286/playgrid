// Server-only helpers that pull monthly USD spend from provider cost APIs.
// Both endpoints require an admin/org key (NOT the regular API key).
// Returns total cents for the given calendar month, or null if unavailable.

export type CostFetchResult =
  | { ok: true; amountCents: number; source: string }
  | { ok: false; error: string };

function periodBounds(periodMonth: Date): { startISO: string; endISO: string } {
  const start = new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth(), 1));
  const end = new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() + 1, 1));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function unixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/**
 * Anthropic cost report. Endpoint:
 *   GET https://api.anthropic.com/v1/organizations/cost_report
 * Auth: x-api-key with an Admin API key (sk-ant-admin-…).
 * Returns paginated buckets each with `amount` in USD (string or number).
 */
export async function fetchAnthropicMonthlyCostCents(
  periodMonth: Date,
  adminKey: string,
): Promise<CostFetchResult> {
  const { startISO, endISO } = periodBounds(periodMonth);
  const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
  url.searchParams.set("starting_at", startISO);
  url.searchParams.set("ending_at", endISO);
  url.searchParams.set("bucket_width", "1d");

  let totalCents = 0;
  let pageToken: string | null = null;
  let pages = 0;

  try {
    do {
      if (pageToken) url.searchParams.set("page", pageToken);
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-api-key": adminKey,
          "anthropic-version": "2023-06-01",
        },
        cache: "no-store",
      });
      const body = await res.text();
      if (!res.ok) {
        let msg = `Anthropic cost API failed (${res.status}).`;
        try {
          const j = JSON.parse(body) as { error?: { message?: string } };
          if (j.error?.message) msg = j.error.message;
        } catch {
          /* ignore */
        }
        return { ok: false, error: msg };
      }
      type AnthropicCostBucket = { results?: Array<{ amount?: number | string }> };
      type AnthropicCostPage = {
        data?: AnthropicCostBucket[];
        has_more?: boolean;
        next_page?: string | null;
      };
      const j = JSON.parse(body) as AnthropicCostPage;
      for (const bucket of j.data ?? []) {
        for (const r of bucket.results ?? []) {
          const amt = typeof r.amount === "string" ? parseFloat(r.amount) : (r.amount ?? 0);
          if (Number.isFinite(amt)) totalCents += Math.round(amt * 100);
        }
      }
      pageToken = j.has_more && j.next_page ? j.next_page : null;
      pages += 1;
      if (pages > 20) break;
    } while (pageToken);

    return { ok: true, amountCents: totalCents, source: "anthropic_cost_report" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Anthropic fetch failed." };
  }
}

/**
 * OpenAI organization costs. Endpoint:
 *   GET https://api.openai.com/v1/organization/costs
 * Auth: Bearer with an Admin key (sk-admin-…).
 * Time range is unix seconds. Returns paginated buckets with `results[].amount.value` in USD.
 */
export async function fetchOpenAIMonthlyCostCents(
  periodMonth: Date,
  adminKey: string,
): Promise<CostFetchResult> {
  const { startISO, endISO } = periodBounds(periodMonth);
  const start = unixSeconds(new Date(startISO));
  const end = unixSeconds(new Date(endISO));
  const url = new URL("https://api.openai.com/v1/organization/costs");
  url.searchParams.set("start_time", String(start));
  url.searchParams.set("end_time", String(end));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", "31");

  let totalCents = 0;
  let pageToken: string | null = null;
  let pages = 0;

  try {
    do {
      if (pageToken) url.searchParams.set("page", pageToken);
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${adminKey}` },
        cache: "no-store",
      });
      const body = await res.text();
      if (!res.ok) {
        let msg = `OpenAI cost API failed (${res.status}).`;
        try {
          const j = JSON.parse(body) as { error?: { message?: string } };
          if (j.error?.message) msg = j.error.message;
        } catch {
          /* ignore */
        }
        return { ok: false, error: msg };
      }
      type OpenAICostBucket = {
        results?: Array<{ amount?: { value?: number | string } }>;
      };
      type OpenAICostPage = {
        data?: OpenAICostBucket[];
        has_more?: boolean;
        next_page?: string | null;
      };
      const j = JSON.parse(body) as OpenAICostPage;
      for (const bucket of j.data ?? []) {
        for (const r of bucket.results ?? []) {
          const raw = r.amount?.value;
          const amt = typeof raw === "string" ? parseFloat(raw) : (raw ?? 0);
          if (Number.isFinite(amt)) totalCents += Math.round(amt * 100);
        }
      }
      pageToken = j.has_more && j.next_page ? j.next_page : null;
      pages += 1;
      if (pages > 20) break;
    } while (pageToken);

    return { ok: true, amountCents: totalCents, source: "openai_organization_costs" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenAI fetch failed." };
  }
}
