/**
 * Display-side name helpers. The user's stored `profiles.display_name`
 * is whatever they typed at signup — sometimes ALL CAPS ("ELIJAH KERRY"),
 * sometimes lowercase, sometimes their full legal name. For UI surfaces
 * like banners and "Shared by …" badges, we want a friendly first-name
 * form that doesn't shout.
 */

/**
 * Returns the first word of a name, title-cased — "ELIJAH KERRY" → "Elijah",
 * "elijah" → "Elijah", "" / null → null. Use for casual surfaces; pair
 * with a fallback string for the null case.
 */
export function firstNameCased(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
