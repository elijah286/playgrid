/**
 * Terms/EULA acceptance gate (App Store Guideline 1.2).
 *
 * Pure predicate so the "does this user still owe us an affirmative Terms
 * acceptance?" decision is testable and used identically by the dashboard
 * layout gate and any other caller. A user needs to accept iff we have no
 * recorded acceptance timestamp. Existing users were grandfathered at migration
 * time (backfilled to created_at), so only brand-new signups read as needing it.
 */
export function termsAcceptanceNeeded(
  termsAcceptedAt: string | null | undefined,
): boolean {
  return !termsAcceptedAt;
}
