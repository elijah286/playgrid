/**
 * Free accounts keep exactly one editable playbook. When a Coach+ user
 * downgrades, computeDowngradeLocks() applies "oldest-first wins": the first
 * playbook they created stays editable and every newer owned playbook is
 * locked (read-only) until they upgrade. So the editable free playbook is
 * precisely the single un-locked owned tile.
 *
 * The dashboard sorts tiles by updated_at descending, which means the most
 * recently touched playbook — often one the coach just created — sits at
 * index 0. That tile is NOT necessarily the editable free playbook (it may be
 * a locked one). Selecting index 0 is the bug this helper exists to prevent:
 * the "you already have your free playbook" modal must name and open the
 * playbook the coach can actually edit, not whichever one was touched last.
 */
export type FreePlaybookCandidate = {
  id: string;
  name: string;
  is_locked?: boolean | null;
  is_archived?: boolean | null;
};

export function pickEditableFreePlaybook<T extends FreePlaybookCandidate>(
  ownedPlaybooks: readonly T[],
): T | null {
  return (
    ownedPlaybooks.find((b) => !b.is_locked && !b.is_archived) ??
    ownedPlaybooks.find((b) => !b.is_locked) ??
    ownedPlaybooks[0] ??
    null
  );
}
