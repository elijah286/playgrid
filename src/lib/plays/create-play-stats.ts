/**
 * Pure helpers for deriving a new play's sort_order and wristband code from
 * the playbook's existing plays. Extracted from createPlayAction so the exact
 * legacy semantics (which the round-trip-collapse refactor must preserve) are
 * unit-testable in isolation.
 *
 * Row-population rules are deliberately different per field and must not be
 * unified:
 *   - sort_order: max over NON-ARCHIVED plays only.
 *   - wristband:  max over EVERY play (archived / attached / deleted / tutorial
 *                 included), so a code is never re-issued to a new play.
 */
export type PlayStatRow = {
  sort_order?: number | null;
  wristband_code?: string | null;
  is_archived?: boolean | null;
};

/**
 * Next sort_order = 1 + max(sort_order) among non-archived plays. Empty (or
 * all-archived) playbook → 0. Mirrors the legacy
 * `is_archived=false ORDER BY sort_order DESC LIMIT 1` + `(?? -1) + 1`.
 */
export function nextSortOrder(rows: PlayStatRow[]): number {
  return (
    rows.reduce(
      (max, r) => (r.is_archived ? max : Math.max(max, r.sort_order ?? -1)),
      -1,
    ) + 1
  );
}

/**
 * Next wristband code: zero-padded string of `1 + max integer-parsable code`
 * across ALL rows. Non-integer codes (e.g. "HOT") are ignored via
 * `parseInt(..., 10)` + `Number.isFinite`, matching the legacy scan exactly
 * (so "12abc" contributes 12, "" / null / "HOT" contribute nothing).
 */
export function nextWristbandCode(rows: PlayStatRow[]): string {
  const maxCode = rows
    .map((r) => parseInt(r.wristband_code ?? "", 10))
    .filter((n): n is number => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return String(maxCode + 1).padStart(2, "0");
}
