// League content library (Phase 1) — types + pure decision logic.
// See docs/league-platform/LIBRARY-DISTRIBUTION-PLAN.md. The library is
// metadata over content the operator authors in their own playbooks; these
// types are shared by the actions, the Library page, and (Phase 2) the
// team-creation auto-seed hook.

import type { Player, Route, Zone } from "@/domain/play/types";

export type LibraryItemKind = "play_group" | "practice_plan";

/** Exactly what PlayThumbnail renders — the layer slices of a PlayDocument. */
export type PlayPreviewData = {
  players: Player[];
  routes: Route[];
  zones: Zone[];
  lineOfScrimmageY: number;
};

export type LibraryPlayPreview = {
  id: string;
  name: string;
  preview: PlayPreviewData;
};

export type LibraryPlanBlock = {
  title: string;
  durationMinutes: number;
  laneCount: number;
};

/**
 * The visual payload for one library item: real diagrams of what a team
 * receives. For a play group, `plays` holds the group's plays (capped —
 * `totalPlays` is the true count). For a practice plan, `plan` holds the
 * timeline summary and `plays` holds any embedded drill diagrams.
 */
export type LibraryItemPreview = {
  itemId: string;
  plays: LibraryPlayPreview[];
  totalPlays: number;
  plan: { totalDurationMinutes: number; blocks: LibraryPlanBlock[] } | null;
  /** Distinct teams this item has been distributed to (the ledger). */
  teamsReached: number;
};

/** Group/plan previews for one source playbook — the "Add to library" picker. */
export type SourcePlaybookPreviews = {
  groups: Record<string, { plays: LibraryPlayPreview[]; totalPlays: number }>;
  plans: Record<
    string,
    { totalDurationMinutes: number; blocks: LibraryPlanBlock[]; drills: LibraryPlayPreview[] }
  >;
};

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

/** Map a league_library_items DB row to the shared shape. */
export function libraryItemFromRow(r: Record<string, unknown>): LibraryItem {
  return {
    id: r.id as string,
    kind: r.kind as LibraryItemKind,
    sourcePlaybookId: r.source_playbook_id as string,
    sourceGroupId: (r.source_group_id as string | null) ?? null,
    sourcePracticePlanId: (r.source_practice_plan_id as string | null) ?? null,
    title: r.title as string,
    sport: r.sport as string,
    variant: r.variant as string,
    tags: (r.tags as string[]) ?? [],
    createdAt: r.created_at as string,
  };
}

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
