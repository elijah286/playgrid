import type { PlayDocument } from "@/domain/play/types";

export type DiffKind = "added" | "removed" | "modified";

export type ElementDiff = {
  players: Map<string, DiffKind>;
  routes: Map<string, DiffKind>;
  zones: Map<string, DiffKind>;
};

export type ElementDiffPair = {
  // Highlights to render on the "target" pane (the older / clicked version).
  // Things present here that are missing from current → "added" (would be
  // brought back by restore). Things changed in shape → "modified".
  target: ElementDiff;
  // Highlights for the "current" pane. Things present here only → "removed"
  // (would be dropped by a restore). Modified items mirror target.
  current: ElementDiff;
};

const POS_EPSILON = 0.005;

export function diffPlayDocuments(target: PlayDocument | null, current: PlayDocument | null): ElementDiffPair {
  const empty: ElementDiffPair = {
    target: { players: new Map(), routes: new Map(), zones: new Map() },
    current: { players: new Map(), routes: new Map(), zones: new Map() },
  };
  if (!target || !current) return empty;

  diffPlayers(target, current, empty);
  diffRoutes(target, current, empty);
  diffZones(target, current, empty);
  return empty;
}

function diffPlayers(target: PlayDocument, current: PlayDocument, out: ElementDiffPair) {
  const t = target.layers?.players ?? [];
  const c = current.layers?.players ?? [];
  const cById = new Map(c.map((p) => [p.id, p]));
  const tById = new Map(t.map((p) => [p.id, p]));
  for (const p of t) {
    const co = cById.get(p.id);
    if (!co) { out.target.players.set(p.id, "added"); continue; }
    const moved =
      Math.abs(co.position.x - p.position.x) > POS_EPSILON ||
      Math.abs(co.position.y - p.position.y) > POS_EPSILON;
    if (moved || co.label !== p.label || co.role !== p.role) {
      out.target.players.set(p.id, "modified");
      out.current.players.set(p.id, "modified");
    }
  }
  for (const p of c) if (!tById.has(p.id)) out.current.players.set(p.id, "removed");
}

function diffRoutes(target: PlayDocument, current: PlayDocument, out: ElementDiffPair) {
  const t = target.layers?.routes ?? [];
  const c = current.layers?.routes ?? [];
  const cById = new Map(c.map((r) => [r.id, r]));
  const tById = new Map(t.map((r) => [r.id, r]));
  for (const r of t) {
    const co = cById.get(r.id);
    if (!co) { out.target.routes.set(r.id, "added"); continue; }
    const famChanged = (co.semantic?.family ?? "custom") !== (r.semantic?.family ?? "custom");
    const shapeChanged = co.nodes.length !== r.nodes.length || co.segments.length !== r.segments.length;
    if (famChanged || shapeChanged) {
      out.target.routes.set(r.id, "modified");
      out.current.routes.set(r.id, "modified");
    }
  }
  for (const r of c) if (!tById.has(r.id)) out.current.routes.set(r.id, "removed");
}

function diffZones(target: PlayDocument, current: PlayDocument, out: ElementDiffPair) {
  const t = target.layers?.zones ?? [];
  const c = current.layers?.zones ?? [];
  const cById = new Map(c.map((z) => [z.id, z]));
  const tById = new Map(t.map((z) => [z.id, z]));
  for (const z of t) if (!cById.has(z.id)) out.target.zones.set(z.id, "added");
  for (const z of c) if (!tById.has(z.id)) out.current.zones.set(z.id, "removed");
}
