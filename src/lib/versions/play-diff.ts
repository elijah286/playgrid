import type { Player, PlayDocument, Route } from "@/domain/play/types";

// Deterministic, short, human-readable summary of changes between two
// PlayDocuments. Designed to be:
//   - cheap to compute and store (a string per version)
//   - readable in a coach-facing changelog
//   - useful as RAG context ("what changed this week")
//
// We diff structurally on stable ids (player.id, route.id) so re-saves
// without changes produce an empty summary (which dedupe should have caught).

export function summarizePlayDiff(prev: PlayDocument, next: PlayDocument): string {
  const parts: string[] = [];

  parts.push(...metadataDiff(prev, next));
  parts.push(...formationDiff(prev, next));
  parts.push(...playersDiff(prev.layers?.players ?? [], next.layers?.players ?? []));
  parts.push(...routesDiff(prev.layers?.routes ?? [], next.layers?.routes ?? [], next.layers?.players ?? []));
  parts.push(...zonesDiff(prev.layers?.zones?.length ?? 0, next.layers?.zones?.length ?? 0));

  return parts.join("; ");
}

function metadataDiff(prev: PlayDocument, next: PlayDocument): string[] {
  const out: string[] = [];
  const m1 = prev.metadata, m2 = next.metadata;
  if (m1.coachName !== m2.coachName) out.push(`Renamed: "${m1.coachName}" → "${m2.coachName}"`);
  if (m1.formation !== m2.formation) out.push(`Formation: "${m1.formation}" → "${m2.formation}"`);
  if (m1.shorthand !== m2.shorthand) out.push(`Shorthand: "${m1.shorthand}" → "${m2.shorthand}"`);
  if ((m1.notes ?? "") !== (m2.notes ?? "")) out.push("Notes changed");
  const t1 = (m1.tags ?? []).join(","), t2 = (m2.tags ?? []).join(",");
  if (t1 !== t2) out.push("Tags changed");
  return out;
}

function formationDiff(prev: PlayDocument, next: PlayDocument): string[] {
  const a = prev.formation?.semantic?.key, b = next.formation?.semantic?.key;
  if (a !== b) return [`Formation key: ${a ?? "—"} → ${b ?? "—"}`];
  const sa = prev.formation?.semantic?.strength, sb = next.formation?.semantic?.strength;
  if (sa !== sb) return [`Strength: ${sa ?? "—"} → ${sb ?? "—"}`];
  return [];
}

function playersDiff(prev: Player[], next: Player[]): string[] {
  const out: string[] = [];
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const nextById = new Map(next.map((p) => [p.id, p]));

  let added = 0, removed = 0, moved = 0, relabeled = 0;
  for (const p of next) {
    if (!prevById.has(p.id)) { added++; continue; }
    const prior = prevById.get(p.id)!;
    if (prior.label !== p.label || prior.role !== p.role) relabeled++;
    if (Math.abs(prior.position.x - p.position.x) > 0.005
      || Math.abs(prior.position.y - p.position.y) > 0.005) moved++;
  }
  for (const p of prev) if (!nextById.has(p.id)) removed++;

  if (added) out.push(`+${added} player${added === 1 ? "" : "s"}`);
  if (removed) out.push(`−${removed} player${removed === 1 ? "" : "s"}`);
  if (moved) out.push(`${moved} player${moved === 1 ? "" : "s"} moved`);
  if (relabeled) out.push(`${relabeled} player${relabeled === 1 ? "" : "s"} relabeled`);
  return out;
}

function routesDiff(prev: Route[], next: Route[], players: Player[]): string[] {
  const out: string[] = [];
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const nextById = new Map(next.map((r) => [r.id, r]));
  const labelByPlayer = new Map(players.map((p) => [p.id, p.label]));

  const added: string[] = [], removed: string[] = [], modified: string[] = [];
  for (const r of next) {
    const prior = prevById.get(r.id);
    if (!prior) {
      added.push(routeLabel(r, labelByPlayer));
      continue;
    }
    if ((prior.semantic?.family ?? "custom") !== (r.semantic?.family ?? "custom")) {
      modified.push(`${routeLabel(r, labelByPlayer)} (${prior.semantic?.family ?? "custom"}→${r.semantic?.family ?? "custom"})`);
    } else if (prior.nodes.length !== r.nodes.length || prior.segments.length !== r.segments.length) {
      modified.push(`${routeLabel(r, labelByPlayer)} reshaped`);
    }
  }
  for (const r of prev) if (!nextById.has(r.id)) removed.push(routeLabel(r, labelByPlayer));

  if (added.length) out.push(`Added route${added.length === 1 ? "" : "s"}: ${added.join(", ")}`);
  if (removed.length) out.push(`Removed route${removed.length === 1 ? "" : "s"}: ${removed.join(", ")}`);
  if (modified.length) out.push(`Changed: ${modified.join(", ")}`);
  return out;
}

function routeLabel(r: Route, labelByPlayer: Map<string, string>): string {
  const who = labelByPlayer.get(r.carrierPlayerId) ?? "?";
  const fam = r.semantic?.family ?? "custom";
  return `${who} ${fam}`;
}

function zonesDiff(prevCount: number, nextCount: number): string[] {
  if (prevCount === nextCount) return [];
  if (nextCount > prevCount) return [`+${nextCount - prevCount} zone${nextCount - prevCount === 1 ? "" : "s"}`];
  return [`−${prevCount - nextCount} zone${prevCount - nextCount === 1 ? "" : "s"}`];
}
