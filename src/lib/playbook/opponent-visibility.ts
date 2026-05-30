/**
 * Decide whether a play's custom-opponent overlay should load hidden.
 *
 * A play saved as "Offense vs Defense" — i.e. a real attached custom opponent,
 * so `customOpponentPlayId` is non-null — MUST render its defense when opened.
 * The persisted `opponent_hidden` flag is only a within-session "Clear" peek
 * toggle (hide the overlay until you navigate away); it never keeps an attached
 * defense hidden across a reload. Without this, a coach who once clicked Clear
 * reopens the play to a blank offense behind a "Show" button — the
 * "Taper Fade vs Cover 1 Man" regression (2026-05-29).
 *
 * When no custom opponent is attached the flag is inert (there's nothing to
 * show), so it passes through unchanged.
 *
 * @param customOpponentPlayId  id of the hidden child play attached to this
 *                              play as its custom opponent, or null if none.
 * @param persistedHidden       the play row's `opponent_hidden` column.
 * @returns the load-time opponentHidden the editor should use.
 */
export function resolveOpponentHiddenOnLoad(
  customOpponentPlayId: string | null,
  persistedHidden: boolean,
): boolean {
  // A saved custom opponent always shows on load; the persisted flag is a
  // session-only peek toggle, never a durable hide.
  if (customOpponentPlayId != null) return false;
  return persistedHidden;
}
