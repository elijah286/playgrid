// Learning Center URL resolver (AGENTS.md Rule 13).
//
// Single source of truth for every internal link to a /learn/library
// page. Cal MUST call this when citing a catalog concept; home-page
// tiles, related-concept sidebars, and the build-time URL validator all
// route through it too.
//
// Returns `null` if no library page exists for the concept yet (Rule 13:
// "Cal cannot link to a page that doesn't exist"). Callers MUST handle
// the null case rather than constructing a URL by hand.

import { findConcept, CONCEPT_CATALOG } from "@/domain/play/conceptCatalog";
import { findTemplate, ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import {
  DEFENSIVE_ALIGNMENTS,
  type DefensiveAlignment,
} from "@/domain/play/defensiveAlignments";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";

/** Defenses are keyed (front, coverage, variant); for library purposes
 *  the human-facing identifier is `${front} ${coverage}` (or just
 *  `coverage` when fronts are generic). Pages display all variants of a
 *  given defense on one page, so the slug is variant-independent. */
function defenseDisplayName(a: DefensiveAlignment): string {
  const front = (a.front ?? "").trim();
  const coverage = (a.coverage ?? "").trim();
  if (!front || front.toLowerCase() === coverage.toLowerCase()) return coverage;
  return `${front} ${coverage}`.trim();
}

function findDefenseByName(name: string): DefensiveAlignment | null {
  const norm = name.toLowerCase().replace(/\s+/g, " ").trim();
  for (const a of DEFENSIVE_ALIGNMENTS) {
    if (defenseDisplayName(a).toLowerCase() === norm) return a;
    if (a.coverage.toLowerCase() === norm) return a;
  }
  return null;
}

export type LearnCategory = "plays" | "formations" | "routes" | "defense";

/** Stable URL slug. Lowercase, alphanumeric + hyphens only. */
export function toLearnSlug(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type LearnLinkInput = {
  /** Display name from a catalog (concept / route / formation / defense).
   *  Case-insensitive; aliases are tried for concepts and routes. */
  concept: string;
  /** Optional category hint to disambiguate when a name exists in
   *  multiple catalogs (rare, but e.g. "Cover 2" could match a defense
   *  alignment and a coverage concept). Falls through plays → defense →
   *  formations → routes when not provided. */
  category?: LearnCategory;
  /** Variant filter the page should default to (e.g. "flag_5v5"). */
  variant?: string;
};

/** Resolve a catalog concept name to its `/learn/library/...` URL, or
 *  `null` if no page exists. Per Rule 13 (catalog → library lockstep),
 *  every entry in CONCEPT_CATALOG, ROUTE_TEMPLATES, DEFENSIVE_ALIGNMENTS,
 *  and FORMATIONS resolves to a real page once Phase 1c's dynamic routes
 *  ship; the build-time validator (`scripts/validate-learn-links.ts`)
 *  asserts that fact. */
export function learnLink(input: LearnLinkInput): string | null {
  const want = input.category;
  const variantQuery = input.variant ? `?v=${encodeURIComponent(input.variant)}` : "";

  const tryPlay = () => {
    const concept = findConcept(input.concept);
    if (!concept) return null;
    return `/learn/library/plays/${toLearnSlug(concept.name)}${variantQuery}`;
  };

  const tryDefense = () => {
    const def = findDefenseByName(input.concept);
    if (!def) return null;
    return `/learn/library/defense/${toLearnSlug(defenseDisplayName(def))}${variantQuery}`;
  };

  const tryFormation = () => {
    const norm = input.concept.toLowerCase();
    const formation = FORMATIONS.find(
      (f) => f.name.toLowerCase() === norm || f.id === norm,
    );
    if (!formation) return null;
    return `/learn/library/formations/${toLearnSlug(formation.name)}${variantQuery}`;
  };

  const tryRoute = () => {
    const tpl = findTemplate(input.concept);
    if (!tpl) return null;
    return `/learn/library/routes/${toLearnSlug(tpl.name)}${variantQuery}`;
  };

  // Honor the category hint first.
  if (want === "plays") return tryPlay();
  if (want === "defense") return tryDefense();
  if (want === "formations") return tryFormation();
  if (want === "routes") return tryRoute();

  // No hint: fall through in priority order (plays are the most-linked
  // surface, routes are the most generic).
  return tryPlay() ?? tryDefense() ?? tryFormation() ?? tryRoute();
}

/** Every URL the library currently exposes. Used by the sitemap
 *  generator and the build-time URL validator. */
export function allLibraryUrls(): string[] {
  const urls: string[] = [
    "/learn/library",
    "/learn/library/plays",
    "/learn/library/formations",
    "/learn/library/routes",
    "/learn/library/defense",
  ];
  for (const c of CONCEPT_CATALOG) {
    urls.push(`/learn/library/plays/${toLearnSlug(c.name)}`);
  }
  for (const f of FORMATIONS) {
    urls.push(`/learn/library/formations/${toLearnSlug(f.name)}`);
  }
  for (const r of ROUTE_TEMPLATES) {
    urls.push(`/learn/library/routes/${toLearnSlug(r.name)}`);
  }
  // Defense pages are keyed by display name (front + coverage). De-dupe
  // because the same (front, coverage) pair may exist across variants.
  const defenseSlugs = new Set<string>();
  for (const d of DEFENSIVE_ALIGNMENTS) {
    defenseSlugs.add(toLearnSlug(defenseDisplayName(d)));
  }
  for (const slug of defenseSlugs) {
    urls.push(`/learn/library/defense/${slug}`);
  }
  return urls;
}
