/**
 * Decide which page-view rows count toward the geography summary.
 *
 * Two independent filters, both applied here so the aggregation loop in
 * admin-geography.ts works on a single already-clean list:
 *   1. Admin-session exclusion — drop every view from any session that was
 *      ever authenticated as an admin (mirrors the Traffic tab).
 *   2. Paying-only — when `payingUserIds` is provided, keep only views tied to
 *      a user in that set. Anonymous (signed-out) views can't be attributed to
 *      a payer, so they drop out entirely.
 *
 * Lives here (not in the "use server" action file) because server-action
 * modules may only export async functions — a pure sync export there fails
 * the Next build. Unit-testable without a database.
 */
export function selectGeoViews<T extends { session_id: string; user_id: string | null }>(
  views: T[],
  opts: { adminIds: ReadonlySet<string>; payingUserIds: ReadonlySet<string> | null },
): T[] {
  const adminSessionIds = new Set<string>();
  for (const v of views) {
    if (v.user_id && opts.adminIds.has(v.user_id)) adminSessionIds.add(v.session_id);
  }
  return views.filter((v) => {
    if (adminSessionIds.has(v.session_id)) return false;
    if (opts.payingUserIds && !(v.user_id && opts.payingUserIds.has(v.user_id))) return false;
    return true;
  });
}
