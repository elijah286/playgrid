import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

// Any account on the company's own email domain is internal (staff, admin@,
// reviewer@, support@, test accounts) and never a real customer — always
// excluded from analytics so internal usage can't skew the numbers.
const COMPANY_EMAIL_DOMAIN = "@xogridmaker.com";

function normalizeEmails(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (!e.includes("@")) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export async function getAnalyticsExcludedEmails(): Promise<string[]> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("analytics_excluded_emails")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return [];
    const raw = (data.analytics_excluded_emails ?? []) as string[];
    return normalizeEmails(raw);
  } catch {
    return [];
  }
}

export async function setAnalyticsExcludedEmails(emails: string[]): Promise<string[]> {
  const cleaned = normalizeEmails(emails);
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, analytics_excluded_emails: cleaned },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
  return cleaned;
}

/**
 * Resolve excluded accounts to auth user IDs. Used by analytics queries to
 * filter out activity from the owner's own/family/test accounts.
 *
 * Two sources of exclusion:
 *   1. The explicit email list (owner / family / test accounts).
 *   2. Any account on the company email domain — staff/admin/reviewer/support
 *      accounts are internal by definition and never real customers.
 *
 * Listed emails that don't match any auth user (typos, not-yet-signed-up) are
 * silently skipped — they only affect filtering once a real account exists.
 */
export async function getAnalyticsExcludedUserIds(): Promise<Set<string>> {
  const wanted = new Set(await getAnalyticsExcludedEmails());
  try {
    const admin = createServiceRoleClient();
    const ids = new Set<string>();
    // listUsers paginates at 1000/page in Supabase; we walk pages until empty.
    // Admin tool with low cardinality, so a few hundred users at most in practice.
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        const e = (u.email ?? "").toLowerCase();
        if (!e) continue;
        // Explicit list (owner / family / test) OR any company-domain account.
        if (wanted.has(e) || e.endsWith(COMPANY_EMAIL_DOMAIN)) ids.add(u.id);
      }
      if (users.length < 1000) break;
    }
    return ids;
  } catch {
    return new Set();
  }
}
