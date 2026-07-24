import type { PlayType } from "@/domain/play/types";
import type { PlaybookDetailPlayRow } from "@/app/actions/plays";

/**
 * Pure filter / sort / group helpers for the shell's team plays view. Extracted
 * from TeamPlaysClient so the behavior is unit-testable without rendering.
 * Mirrors the production grid (playbooks/[playbookId]/ui.tsx): offense-first
 * type order, group-by type/formation/group, and manual (sort_order) default.
 */

export const TYPE_ORDER: Record<PlayType, number> = {
  offense: 0,
  defense: 1,
  special_teams: 2,
  practice_plan: 3,
};

export const TYPE_LABEL: Record<PlayType, string> = {
  offense: "Offense",
  defense: "Defense",
  special_teams: "Special Teams",
  practice_plan: "Practice Plan",
};

export type SortMode = "manual" | "recent" | "name";
export type GroupBy = "type" | "formation" | "group" | "none";

/** Minimal shape of a playbook group (from listPlaysAction's `groups`). */
export type PlayGroup = { id: string; name: string; sort_order: number };

/** A rendered section: a header label + its plays (label "" ⇒ no header). */
export type PlaySection = {
  key: string;
  label: string;
  plays: PlaybookDetailPlayRow[];
};

const UNGROUPED = "__ungrouped__";
const NO_FORMATION = "__no_formation__";

/** Distinct play types present, in offense-first order (for the filter chips). */
export function presentPlayTypes(plays: PlaybookDetailPlayRow[]): PlayType[] {
  const set = new Set<PlayType>();
  for (const p of plays) set.add(p.play_type);
  return [...set].sort((a, b) => TYPE_ORDER[a] - TYPE_ORDER[b]);
}

/** Type filter + free-text search + (optional) archived. */
export function filterPlays(
  plays: PlaybookDetailPlayRow[],
  q: string,
  typeFilter: PlayType | "all",
  showArchived = false,
): PlaybookDetailPlayRow[] {
  const s = q.trim().toLowerCase();
  return plays.filter((p) => {
    if (!showArchived && p.is_archived) return false;
    if (typeFilter !== "all" && p.play_type !== typeFilter) return false;
    if (!s) return true;
    return (
      p.name.toLowerCase().includes(s) ||
      (p.shorthand?.toLowerCase().includes(s) ?? false) ||
      (p.formation_name?.toLowerCase().includes(s) ?? false) ||
      p.tags.some((t) => t.toLowerCase().includes(s))
    );
  });
}

/** Sort a flat list. `manual` = the coach's drag order (sort_order). */
export function sortPlays(
  plays: PlaybookDetailPlayRow[],
  mode: SortMode,
): PlaybookDetailPlayRow[] {
  const rows = plays.slice();
  if (mode === "name") {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  } else if (mode === "recent") {
    rows.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  } else {
    rows.sort((a, b) => a.sort_order - b.sort_order);
  }
  return rows;
}

/**
 * Bucket already-filtered+sorted plays into sections. Within-bucket order is
 * preserved (so the chosen sort holds); section ORDER depends on `groupBy`:
 * type → offense-first, group → the coach's group order, formation → A→Z.
 */
export function groupPlays(
  plays: PlaybookDetailPlayRow[],
  groupBy: GroupBy,
  groups: PlayGroup[] = [],
): PlaySection[] {
  if (groupBy === "none") {
    return plays.length ? [{ key: "all", label: "", plays }] : [];
  }

  const buckets = new Map<string, PlaybookDetailPlayRow[]>();
  const keyOf = (p: PlaybookDetailPlayRow): string =>
    groupBy === "type"
      ? p.play_type
      : groupBy === "formation"
        ? (p.formation_name?.trim() || NO_FORMATION)
        : (p.group_id ?? UNGROUPED);
  for (const p of plays) {
    const k = keyOf(p);
    const arr = buckets.get(k);
    if (arr) arr.push(p);
    else buckets.set(k, [p]);
  }

  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const groupOrder = new Map(groups.map((g) => [g.id, g.sort_order]));

  const sections = [...buckets.entries()].map(([key, rows]) => {
    let label: string;
    if (groupBy === "type") label = TYPE_LABEL[key as PlayType];
    else if (groupBy === "formation") label = key === NO_FORMATION ? "Unassigned formation" : key;
    else label = key === UNGROUPED ? "Ungrouped" : (groupName.get(key) ?? "Ungrouped");
    return { key, label, plays: rows };
  });

  sections.sort((a, b) => {
    if (groupBy === "type") return TYPE_ORDER[a.key as PlayType] - TYPE_ORDER[b.key as PlayType];
    if (groupBy === "group") {
      // Ungrouped sinks to the bottom; otherwise the coach's group order.
      if (a.key === UNGROUPED) return 1;
      if (b.key === UNGROUPED) return -1;
      return (groupOrder.get(a.key) ?? 0) - (groupOrder.get(b.key) ?? 0);
    }
    // formation: A→Z, unassigned last.
    if (a.key === NO_FORMATION) return 1;
    if (b.key === NO_FORMATION) return -1;
    return a.label.localeCompare(b.label);
  });
  return sections;
}
