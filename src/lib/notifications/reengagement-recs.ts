import { learnLink } from "@/lib/learn/links";
import type { LibraryVariant } from "@/lib/learn/variant";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

/** Turn the relative path `learnLink()` returns into a fully-qualified
 *  URL. Required for any caller emitting links into an email or other
 *  off-site surface — relative paths look broken in inboxes. */
function absolutize(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Append UTM params for re-engagement-email attribution. We use the
 *  app-wide page_views table's existing utm_* columns (no schema change),
 *  so a click from any reengagement email shows up as a page view tagged
 *  utm_source=reengagement and we can attribute returns + conversions to
 *  the specific send via utm_campaign (3d/10d) and utm_content. */
export function withReengagementUtm(
  url: string,
  campaign: "3d" | "10d",
  content: string,
): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "reengagement");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", campaign);
  u.searchParams.set("utm_content", content);
  return u.toString();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Per-variant "what coach X added next" trio.
 *
 *  Hand-curated starter plays for each library variant — the same plays
 *  Cal recommends as a 2nd-3rd play for a fresh playbook. Picked for
 *  pedagogical diversity (one quick-hit, one route-combo, one
 *  high-low) rather than personal preference.
 *
 *  Update when the football library adds new high-confidence starter
 *  concepts. The build-time learn-link validator
 *  (`scripts/validate-learn-links.ts`) catches concept names that
 *  don't resolve. */
const RECOMMENDATIONS_BY_VARIANT: Record<LibraryVariant, string[]> = {
  flag_5v5: ["Mesh", "Smash", "Stick"],
  flag_6v6: ["Mesh", "Smash", "Stick"],
  flag_7v7: ["Mesh", "Smash", "Stick"],
  tackle_11: ["Slants", "Stick", "Mesh"],
};

/** Fallback used when sport_variant isn't recognized (legacy data, or
 *  a variant we don't have specific picks for yet). */
const FALLBACK_RECS = ["Mesh", "Smash", "Stick"];

export type PlayRecommendation = {
  /** Display name as it appears on the library card. */
  name: string;
  /** Full /learn/library URL for the variant-specific page. */
  url: string;
};

/** Map raw sport_variant string from `playbooks.sport_variant` to a
 *  LibraryVariant key. Defensive: unknown inputs fall through to the
 *  flag_5v5 default rather than throwing — re-engagement should never
 *  block on data quality. */
function normalizeVariant(raw: string | null | undefined): LibraryVariant {
  const v = (raw ?? "").toLowerCase().replace(/-/g, "_");
  if (v === "flag_5v5" || v === "flag_6v6" || v === "flag_7v7" || v === "tackle_11") {
    return v;
  }
  // Common legacy / synonym mappings.
  if (v === "touch_7v7") return "flag_7v7";
  if (v === "youth_11man" || v === "pop_warner_11man" || v === "tackle_11man") {
    return "tackle_11";
  }
  return "flag_5v5";
}

/**
 * Build a 3-play recommendation list for a stalled-1-play user.
 *
 * - Excludes any concept that matches `excludeConcept` (the user's
 *   one existing play) so we never recommend a play they already drew.
 * - Falls through to a backup pick if exclusion would drop us below 3.
 * - Returns library URLs scoped to the user's variant so the user lands
 *   on the right page on first click.
 *
 * Pure function — no DB / network calls. Safe to use from the cron and
 * from the test-send script.
 */
export function buildRecommendations(input: {
  sportVariant: string | null;
  excludeConcept: string | null;
}): PlayRecommendation[] {
  const variant = normalizeVariant(input.sportVariant);
  const exclude = (input.excludeConcept ?? "").toLowerCase().trim();
  const picks = RECOMMENDATIONS_BY_VARIANT[variant] ?? FALLBACK_RECS;

  // Backup pool — used only if exclusion dropped us below 3 picks.
  // Kept small and per-variant so we always land on a real page.
  const backup: Record<LibraryVariant, string[]> = {
    flag_5v5: ["Y-Cross", "Drive", "Levels"],
    flag_6v6: ["Y-Cross", "Drive", "Levels"],
    flag_7v7: ["Y-Cross", "Drive", "Levels"],
    tackle_11: ["Y-Cross", "Drive", "Levels"],
  };
  const pool: string[] = [...picks, ...(backup[variant] ?? [])];

  const seen = new Set<string>();
  const out: PlayRecommendation[] = [];
  for (const name of pool) {
    if (out.length >= 3) break;
    const norm = name.toLowerCase();
    if (norm === exclude) continue;
    if (seen.has(norm)) continue;
    const path = learnLink({ concept: name, category: "plays", variant });
    if (!path) continue;
    seen.add(norm);
    out.push({ name, url: absolutize(path) });
  }
  return out;
}
