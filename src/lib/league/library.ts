// League content library (Phase 1) — types + pure decision logic.
// See docs/league-platform/LIBRARY-DISTRIBUTION-PLAN.md. The library is
// metadata over content the operator authors in their own playbooks; these
// types are shared by the actions, the Library page, and (Phase 2) the
// team-creation auto-seed hook.

export type LibraryItemKind = "play_group" | "practice_plan";

export type LibraryItem = {
  id: string;
  kind: LibraryItemKind;
  sourcePlaybookId: string;
  sourceGroupId: string | null;
  sourcePracticePlanId: string | null;
  title: string;
  sport: string;
  variant: string;
  tags: string[];
  createdAt: string;
};

/** A default rule: apply `itemId` to new teams — org-wide (leagueId null) or
 *  for one league. The variant match comes from the item itself. */
export type LibraryDefault = {
  id: string;
  itemId: string;
  leagueId: string | null;
};

/** Sources the operator can register from: their playbooks' named play
 *  groups and practice plans. */
export type LibrarySourcePlaybook = {
  playbookId: string;
  playbookName: string;
  variant: string;
  groups: { id: string; name: string; playCount: number }[];
  practicePlans: { id: string; title: string }[];
};

/**
 * Which library items should seed a NEW team? Pure so Phase 2's hook and the
 * Library page's "applies to new teams" preview agree by construction.
 * A default applies when its scope covers the league (org-wide or that
 * league) AND the item's variant matches the team's game type. De-duped —
 * an item defaulted both org-wide and per-league applies once.
 */
export function defaultsForNewTeam(
  items: LibraryItem[],
  defaults: LibraryDefault[],
  leagueId: string,
  variant: string,
): LibraryItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const applied = new Map<string, LibraryItem>();
  for (const d of defaults) {
    if (d.leagueId !== null && d.leagueId !== leagueId) continue;
    const item = byId.get(d.itemId);
    if (!item || item.variant !== variant) continue;
    applied.set(item.id, item);
  }
  return [...applied.values()];
}
