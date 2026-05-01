import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

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
 * Resolve excluded emails to auth user IDs. Used by analytics queries to
 * filter out activity from the owner's own/family/test accounts.
 *
 * Excluded emails that don't match any auth user (typos, not-yet-signed-up)
 * are silently skipped — they only affect downstream filtering once a real
 * account exists.
 */
export async function getAnalyticsExcludedUserIds(): Promise<Set<string>> {
  const emails = await getAnalyticsExcludedEmails();
  if (emails.length === 0) return new Set();
  try {
    const admin = createServiceRoleClient();
    const wanted = new Set(emails);
    const ids = new Set<string>();
    // listUsers paginates at 1000/page in Supabase; we walk pages until empty.
    // Admin tool with low cardinality, so a few hundred users at most in practice.
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        const e = (u.email ?? "").toLowerCase();
        if (e && wanted.has(e)) ids.add(u.id);
      }
      if (users.length < 1000) break;
    }
    return ids;
  } catch {
    return new Set();
  }
}
