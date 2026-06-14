// Server-side thumbnail builders for the home page Football Library
// teaser. Each featured tile renders a REAL diagram — the same render
// path the library detail pages and in-app editor use (Rule 14: one
// render path, no static PNG/SVG illustrations of plays). We resolve
// each concept's geometry server-side and hand the layer data to the
// static <PlayThumbnail> SVG component.
//
// The four card kinds each show what they actually represent:
//   - play       → full concept skeleton (Mesh, Smash, Four Verticals)
//   - formation  → offensive alignment, players only (Trips)
//   - route      → one receiver running the route (Slant)
//   - defense    → defenders + zones for a coverage (Defenses)
//
// Every builder is defensive: anything that fails to resolve returns
// null and the tile falls back to its gradient header. No throw ever
// reaches the page render.
import { coachDiagramToPlayDocument, type CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { synthesizeOffense } from "@/domain/play/offensiveSynthesize";
import {
  DEFENSIVE_ALIGNMENTS,
  alignmentWithAssignments,
  zonesForStrength,
} from "@/domain/play/defensiveAlignments";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "@/domain/play/spec";
import type { PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
import type { LibraryVariant } from "@/lib/learn/variant";

type Doc = ReturnType<typeof coachDiagramToPlayDocument>;

function docToThumbnail(doc: Doc): PlayThumbnailInput {
  return {
    players: doc.layers.players,
    routes: doc.layers.routes,
    zones: doc.layers.zones,
    lineOfScrimmageY: doc.lineOfScrimmageY ?? 0.5,
  };
}

/** Suffix duplicate roster-style ids (DE / DE2) — the converter rejects
 *  duplicate ids. Same pattern the library defense page + compose_defense
 *  use. */
function suffixDuplicateIds<T extends { id: string }>(players: T[]): T[] {
  const seen = new Map<string, number>();
  return players.map((p) => {
    const count = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, count);
    const id = count === 1 ? p.id : `${p.id}${count}`;
    return { ...p, id };
  });
}

/** A named play concept (Mesh, Smash, Four Verticals): full skeleton. */
export function playConceptThumbnail(
  concept: string,
  variant: LibraryVariant,
): PlayThumbnailInput | null {
  try {
    const skeleton = generateConceptSkeleton(concept, { variant, strength: "right" });
    if (!skeleton.ok) return null;
    const { diagram } = playSpecToCoachDiagram(skeleton.spec);
    return docToThumbnail(coachDiagramToPlayDocument(diagram));
  } catch {
    return null;
  }
}

// Eligible receivers get a short vertical release stem in the formation
// thumbnail. A bare formation is ~24 yds wide and only ~5 yds deep, so
// it squishes into an unreadable band at the LOS; short release stems
// give the tile vertical body and read as an alignment chart. Linemen,
// QB, center and the back stay as plain alignment dots.
const FORMATION_RELEASE_IDS = ["X", "Y", "Z", "H", "S", "A", "F"];
const RELEASE_DEPTH_YDS = 7;

/** An offensive formation (Trips): players at their alignment with a
 *  short release stem on each eligible receiver. Tries the preferred
 *  variant first, then falls back through the rest. */
export function formationThumbnail(
  formation: string,
  variants: LibraryVariant[],
): PlayThumbnailInput | null {
  for (const variant of variants) {
    try {
      const synth = synthesizeOffense(variant, formation);
      if (!synth || !synth.exactMatch) continue;
      const releaseIds = synth.players
        .map((p) => p.id)
        .filter((id) => FORMATION_RELEASE_IDS.includes(id));
      const spec: PlaySpec = {
        schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
        variant,
        title: `${formation} formation`,
        playType: "offense",
        formation: { name: formation, strength: "right" },
        assignments: releaseIds.map((id) => ({
          player: id,
          confidence: "high" as const,
          action: { kind: "route" as const, family: "Go", depthYds: RELEASE_DEPTH_YDS },
        })),
      };
      const { diagram } = playSpecToCoachDiagram(spec);
      return docToThumbnail(coachDiagramToPlayDocument(diagram));
    } catch {
      // try next variant
    }
  }
  return null;
}

/** A single route (Slant): one receiver (@X) running it, plus the QB. */
export function routeThumbnail(
  routeName: string,
  variant: LibraryVariant,
): PlayThumbnailInput | null {
  try {
    const route = ROUTE_TEMPLATES.find((r) => r.name === routeName);
    if (!route) return null;
    const range = route.constraints?.depthRangeYds;
    const depth = range ? Math.round((range.min + range.max) / 2) : 8;
    const spec: PlaySpec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant,
      title: `${route.name} demo`,
      playType: "offense",
      formation: { name: "Spread Doubles", strength: "right" },
      assignments: [
        {
          player: "X",
          confidence: "high",
          action: { kind: "route", family: route.name, depthYds: depth },
        },
      ],
    };
    const { diagram } = playSpecToCoachDiagram(spec);
    const KEEP = new Set(["QB", "X"]);
    const slim = {
      ...diagram,
      players: diagram.players.filter((p) => KEEP.has(p.id)),
      routes: (diagram.routes ?? []).filter((r) => KEEP.has(r.from)),
    };
    return docToThumbnail(coachDiagramToPlayDocument(slim));
  } catch {
    return null;
  }
}

/** A defensive coverage (Defenses): defenders + zones. Prefers a
 *  zone-rich coverage (Cover 3) so the card shows zone rectangles, then
 *  falls back to any alignment that renders for the chosen variant. */
export function defenseThumbnail(
  variants: LibraryVariant[],
): PlayThumbnailInput | null {
  for (const variant of variants) {
    const pool = DEFENSIVE_ALIGNMENTS.filter((a) => a.variant === variant);
    const zoneFirst = [
      ...pool.filter((a) => /cover\s*3/i.test(a.coverage)),
      ...pool.filter((a) => !/cover\s*3/i.test(a.coverage)),
    ];
    for (const a of zoneFirst) {
      try {
        const defenders = alignmentWithAssignments(a, "right");
        const zones = zonesForStrength(a, "right");
        const unique = suffixDuplicateIds(
          defenders.map((p) => ({ id: p.id, x: p.x, y: p.y })),
        );
        const diagram: CoachDiagram = {
          title: a.coverage,
          variant,
          focus: "D",
          players: unique.map((p) => ({ id: p.id, x: p.x, y: p.y, team: "D" as const })),
          routes: [],
          zones: zones.map((z) => ({
            kind: z.kind,
            center: z.center,
            size: z.size,
            label: z.label,
          })),
        };
        return docToThumbnail(coachDiagramToPlayDocument(diagram));
      } catch {
        // try next alignment / variant
      }
    }
  }
  return null;
}
