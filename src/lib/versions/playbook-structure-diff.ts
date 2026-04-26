// Detailed, line-by-line summary of changes between two playbook structure
// snapshots. The snapshot shape matches `recordPlaybookVersion`:
//   - groups: { id, name, sort_order }[]
//   - plays:  { id, name, group_id, sort_order }[]
//
// Output is an array of human-readable strings, e.g.
//   - Renamed group "Open" → "Spread"
//   - Moved "Power" from "Run" to "Pass"
//   - Reordered: "Power" #2 → #4

export type PlaybookSnapshotDoc = {
  groups: { id: string; name: string; sort_order: number }[];
  plays: { id: string; name: string; group_id: string | null; sort_order: number }[];
};

export function summarizePlaybookStructureDiff(
  prev: PlaybookSnapshotDoc | null,
  next: PlaybookSnapshotDoc | null,
): string[] {
  if (!next) return [];
  if (!prev) return ["Initial snapshot"];

  const out: string[] = [];

  const prevGroupById = new Map(prev.groups.map((g) => [g.id, g]));
  const nextGroupById = new Map(next.groups.map((g) => [g.id, g]));

  // Group adds / renames / deletes
  for (const g of next.groups) {
    const before = prevGroupById.get(g.id);
    if (!before) {
      out.push(`Added group "${g.name}"`);
    } else if (before.name !== g.name) {
      out.push(`Renamed group "${before.name}" → "${g.name}"`);
    }
  }
  for (const g of prev.groups) {
    if (!nextGroupById.has(g.id)) out.push(`Deleted group "${g.name}"`);
  }

  // Group reorder — compare ordered sequence of ids that survived in both.
  const prevOrderIds = prev.groups
    .filter((g) => nextGroupById.has(g.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => g.id);
  const nextOrderIds = next.groups
    .filter((g) => prevGroupById.has(g.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => g.id);
  if (
    prevOrderIds.length === nextOrderIds.length &&
    prevOrderIds.some((id, i) => id !== nextOrderIds[i])
  ) {
    const labels = nextOrderIds.map((id) => nextGroupById.get(id)?.name ?? "");
    out.push(`Reordered groups: ${labels.join(" → ")}`);
  }

  // Play moves between groups, reorder, deletes/adds.
  const prevPlayById = new Map(prev.plays.map((p) => [p.id, p]));
  const nextPlayById = new Map(next.plays.map((p) => [p.id, p]));

  const groupNameForPrev = (gid: string | null) =>
    gid ? prevGroupById.get(gid)?.name ?? "(deleted)" : "Ungrouped";
  const groupNameForNext = (gid: string | null) =>
    gid ? nextGroupById.get(gid)?.name ?? "(deleted)" : "Ungrouped";

  // Adds (new plays) and renames are usually surfaced via play-level versions,
  // but we still show them at the structure level for completeness.
  for (const p of next.plays) {
    const before = prevPlayById.get(p.id);
    if (!before) {
      out.push(`Added play "${p.name}" to ${groupNameForNext(p.group_id)}`);
      continue;
    }
    if ((before.group_id ?? null) !== (p.group_id ?? null)) {
      out.push(
        `Moved "${p.name}" from ${groupNameForPrev(before.group_id)} → ${groupNameForNext(p.group_id)}`,
      );
    }
  }
  for (const p of prev.plays) {
    if (!nextPlayById.has(p.id)) {
      out.push(`Removed play "${p.name}" from ${groupNameForPrev(p.group_id)}`);
    }
  }

  // Per-group reordering: detect plays that changed sort_order rank within
  // their (still-same) group. We report at most a few moves to keep the
  // summary readable.
  const moves: string[] = [];
  for (const groupId of new Set([
    ...prev.groups.map((g) => g.id),
    ...next.groups.map((g) => g.id),
    "__ungrouped__",
  ])) {
    const gKey = groupId === "__ungrouped__" ? null : groupId;
    const prevInGroup = prev.plays
      .filter((p) => (p.group_id ?? null) === gKey && nextPlayById.has(p.id))
      .filter((p) => (nextPlayById.get(p.id)!.group_id ?? null) === gKey)
      .sort((a, b) => a.sort_order - b.sort_order);
    const nextInGroup = next.plays
      .filter((p) => (p.group_id ?? null) === gKey && prevPlayById.has(p.id))
      .filter((p) => (prevPlayById.get(p.id)!.group_id ?? null) === gKey)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (prevInGroup.length !== nextInGroup.length) continue;
    const groupLabel =
      gKey === null
        ? "Ungrouped"
        : nextGroupById.get(gKey)?.name ?? prevGroupById.get(gKey)?.name ?? "";
    for (let i = 0; i < nextInGroup.length; i++) {
      const before = prevInGroup[i];
      const after = nextInGroup[i];
      if (before.id !== after.id) {
        const beforeIdx = prevInGroup.findIndex((p) => p.id === after.id);
        if (beforeIdx >= 0 && beforeIdx !== i) {
          moves.push(`"${after.name}" #${beforeIdx + 1} → #${i + 1}${groupLabel ? ` in ${groupLabel}` : ""}`);
        }
      }
    }
  }
  if (moves.length > 0) {
    const shown = moves.slice(0, 4);
    const more = moves.length - shown.length;
    out.push(
      `Reordered: ${shown.join("; ")}${more > 0 ? ` (+${more} more)` : ""}`,
    );
  }

  return out;
}
