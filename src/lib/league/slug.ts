// Single source of truth for league registration-link slugs. Used by the
// Settings server action AND Leo's set_registration_link tool so both validate
// identically (a "use server" file can't export this helper itself).

/** lowercase letters/digits/hyphens, 1–50 chars, no leading/trailing hyphen.
 *  Returns `{ ok:true, slug:null }` for empty input (clears the slug). */
export function normalizeLeagueSlug(
  s: string,
): { ok: true; slug: string | null } | { ok: false } {
  const t = s.trim().toLowerCase();
  if (!t) return { ok: true, slug: null };
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(t)) return { ok: false };
  return { ok: true, slug: t };
}
