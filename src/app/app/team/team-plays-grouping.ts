import type { PlayType } from "@/domain/play/types";
import type { PlaybookDetailPlayRow } from "@/app/actions/plays";

/**
 * Pure grouping/filter helpers for the shell's team plays view. Extracted from
 * TeamPlaysClient so the offense-first ordering + search/filter behavior is
 * unit-testable without rendering. Mirrors the production grouping constants
 * (playbooks/[playbookId]/ui.tsx): offense first, special teams third.
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

export type PlaySection = {
  type: PlayType;
  label: string;
  plays: PlaybookDetailPlayRow[];
};

/** Distinct play types present, in offense-first order (for the filter chips). */
export function presentPlayTypes(plays: PlaybookDetailPlayRow[]): PlayType[] {
  const set = new Set<PlayType>();
  for (const p of plays) set.add(p.play_type);
  return [...set].sort((a, b) => TYPE_ORDER[a] - TYPE_ORDER[b]);
}

/** Apply the type filter + free-text search (name / shorthand / formation / tags). */
export function filterPlays(
  plays: PlaybookDetailPlayRow[],
  q: string,
  typeFilter: PlayType | "all",
): PlaybookDetailPlayRow[] {
  const s = q.trim().toLowerCase();
  return plays.filter((p) => {
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

/**
 * Group plays into offense-first sections; within a section preserve the
 * coach's manual order (sort_order), same as the production grid.
 */
export function groupPlaysOffenseFirst(plays: PlaybookDetailPlayRow[]): PlaySection[] {
  const byType = new Map<PlayType, PlaybookDetailPlayRow[]>();
  for (const p of plays) {
    const arr = byType.get(p.play_type);
    if (arr) arr.push(p);
    else byType.set(p.play_type, [p]);
  }
  return [...byType.entries()]
    .sort(([a], [b]) => TYPE_ORDER[a] - TYPE_ORDER[b])
    .map(([type, rows]) => ({
      type,
      label: TYPE_LABEL[type],
      plays: rows.slice().sort((a, b) => a.sort_order - b.sort_order),
    }));
}
