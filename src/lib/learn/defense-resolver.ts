// Defense alignment resolver — async helper that consults the
// admin override layer first, falls back to the catalog.
//
// Architecture (mirrors `concept-resolver.ts` for offense):
//
//   library defense page  ──┐
//                           ├─► resolveDefensiveAlignment(variant, front, coverage)
//   Cal compose_defense  ───┘         │
//   Cal place_defense    ───┘         │
//   notes-from-spec      ───┘         ▼
//          ┌──────────────────────────────────────────┐
//          │ 1. library_concept_overrides hit?        │
//          │    → overlay override.document positions │
//          │       onto the catalog alignment         │
//          │    → preserve catalog assignments        │
//          │       (man/zone/blitz/spy targets)       │
//          │    → return merged DefensiveAlignment    │
//          │                                          │
//          │ 2. otherwise:                            │
//          │    → return catalog match unchanged      │
//          └──────────────────────────────────────────┘
//
// Why preserve assignments from the catalog instead of trying to
// derive them from the override: the override stores a rendered
// PlayDocument (defenders + zones in normalized coords). It does
// NOT carry per-defender assignment kind (zone/man/blitz/spy) — the
// admin editor lets coaches reposition players but doesn't surface
// the per-defender role widget. Honoring the catalog's assignments
// keeps notes generation + Cal's chat-time prose accurate. Admins
// editing positions are saying "the FS should be at y=14 not y=12"
// not "FS now plays man instead of zone."

import "server-only";

import {
  DEFENSIVE_ALIGNMENTS,
  findDefensiveAlignment,
  type DefensiveAlignment,
  type DefensiveAlignmentPlayer,
  type DefensiveAlignmentZone,
} from "@/domain/play/defensiveAlignments";
import { sportProfileForVariant } from "@/domain/play/factory";
import type { PlayDocument, SportVariant } from "@/domain/play/types";
import { loadLibraryOverride } from "@/lib/learn/overrides";
import { toLearnSlug } from "@/lib/learn/links";

/** Slug used by the library defense page (and the admin override
 *  table) for a given (front, coverage) pair. Mirrors
 *  `defenseDisplayName` in src/app/learn/library/defense/[slug]/page.tsx
 *  — keep them in sync. */
function defenseSlug(front: string, coverage: string): string {
  const f = (front ?? "").trim();
  const c = (coverage ?? "").trim();
  const name =
    !f || f.toLowerCase() === c.toLowerCase()
      ? c
      : `${f} ${c}`.trim();
  return toLearnSlug(name);
}

/** Resolve a defensive alignment, preferring any admin override
 *  saved through the library editor. Returns null when neither the
 *  override nor the catalog has the (variant, front, coverage)
 *  tuple — same null contract as `findDefensiveAlignment`.
 *
 *  Used by both Cal's defense tools (compose_defense, place_defense)
 *  and the public library defense page so admin edits flow to both
 *  surfaces without per-caller code. */
export async function resolveDefensiveAlignment(
  variant: string,
  front: string,
  coverage: string,
): Promise<DefensiveAlignment | null> {
  const catalogMatch = findDefensiveAlignment(variant, front, coverage);
  const slug = defenseSlug(front, coverage);
  // Only valid library variants have overrides — flag_4v4 / touch_7v7
  // alignments live in the catalog but the override table is keyed by
  // the four user-facing library variants. Skip the lookup for the
  // others (they don't have library pages, can't have overrides).
  const v = catalogMatch?.variant ?? (variant as DefensiveAlignment["variant"]);
  const override = await loadLibraryOverride(slug, v);
  if (!override) return catalogMatch;
  if (!catalogMatch) {
    // Override exists but no catalog reference — we can't recover
    // assignment kinds without it, so trust the catalog null.
    console.warn(
      `[defense-resolver] override exists for ${slug}:${variant} but no catalog match — ignoring override`,
    );
    return null;
  }
  try {
    return mergeOverrideIntoAlignment(catalogMatch, override.document);
  } catch (err) {
    console.warn(
      `[defense-resolver] override merge failed for ${slug}:${variant} — using catalog`,
      err,
    );
    return catalogMatch;
  }
}

/** Overlay an admin-edited PlayDocument's defender positions + zones
 *  onto the catalog DefensiveAlignment. Returns a NEW alignment
 *  object — never mutates the catalog entry.
 *
 *  Defenders: match by label (with suffixed-duplicate handling —
 *  catalog DE/DE2 line up with override DE/DE2). Positions converted
 *  from normalized to yards using the variant's field dimensions.
 *  Assignment field (zone/man/blitz/spy) preserved from the catalog
 *  — see file header for rationale.
 *
 *  Zones: full replacement. The override's zone shapes (center +
 *  size) replace the catalog's. Zone ids preserved when present so
 *  defender→zone assignment lookups still resolve.
 */
function mergeOverrideIntoAlignment(
  catalog: DefensiveAlignment,
  doc: PlayDocument,
): DefensiveAlignment {
  const profile = sportProfileForVariant(catalog.variant as SportVariant);
  const LOS_Y = 0.4; // mirrors coachDiagramConverter.ts:527

  const toYards = (p: { x: number; y: number }) => ({
    x: (p.x - 0.5) * profile.fieldWidthYds,
    y: (p.y - LOS_Y) * profile.fieldLengthYds,
  });

  // Build a lookup from suffixed-unique-id → catalog player (so DE
  // and DE2 each resolve to their own catalog entry). The suffix
  // logic must match the one in src/app/learn/library/defense/[slug]/page.tsx
  // and tools.ts — see those for the reference.
  const seen = new Map<string, number>();
  const catalogByUid = new Map<string, DefensiveAlignmentPlayer>();
  for (const cp of catalog.players) {
    const count = (seen.get(cp.id) ?? 0) + 1;
    seen.set(cp.id, count);
    const uid = count === 1 ? cp.id : `${cp.id}${count}`;
    catalogByUid.set(uid, cp);
  }

  // Walk override defenders, looking up the catalog counterpart by
  // label or id. Players in the override that don't match any
  // catalog defender are dropped (they'd have no assignment).
  // PlayDocument players don't carry an offense/defense team flag —
  // we identify defenders by their PlayerRole being one of the
  // defensive ones (DL / LB / CB / S / NB).
  const DEFENSIVE_ROLES = new Set<string>(["DL", "LB", "CB", "S", "NB"]);
  const overrideDefenders = doc.layers.players.filter((p) =>
    DEFENSIVE_ROLES.has(p.role),
  );
  const newPlayers: DefensiveAlignmentPlayer[] = [];
  for (const op of overrideDefenders) {
    const cp =
      catalogByUid.get(op.label) ??
      catalogByUid.get(op.id) ??
      // Strip trailing digits to handle DE→DE2 mismatches in either
      // direction (some renderers emit the suffixed id, some emit
      // the bare label).
      catalogByUid.get(op.label.replace(/\d+$/, "")) ??
      catalogByUid.get(op.id.replace(/\d+$/, ""));
    if (!cp) continue;
    const { x, y } = toYards(op.position);
    newPlayers.push({
      id: cp.id, // canonical label
      x,
      y,
      assignment: cp.assignment, // preserved from catalog
    });
  }

  // Zones: convert PlayDocument's half-extent size to alignment's
  // full-size + yards.
  const newZones: DefensiveAlignmentZone[] = (doc.layers.zones ?? []).map(
    (z) => {
      const center = toYards(z.center);
      return {
        ...(z.id ? { id: z.id } : {}),
        kind: z.kind,
        center: [center.x, center.y],
        // PlayDocument Zone.size is { w, h } HALF-extents in normalized
        // coords. Alignment zone size is [width, height] FULL in yards.
        size: [
          z.size.w * 2 * profile.fieldWidthYds,
          z.size.h * 2 * profile.fieldLengthYds,
        ],
        label: z.label,
      };
    },
  );

  return {
    ...catalog,
    players: newPlayers.length > 0 ? newPlayers : catalog.players,
    zones: newZones.length > 0 ? newZones : catalog.zones,
  };
}

/** Synchronous catalog-only enumeration. Re-exported for callers
 *  that need every catalog defense (sitemap, validators, etc.) and
 *  don't care about per-(variant, front, coverage) overrides. */
export { DEFENSIVE_ALIGNMENTS };
