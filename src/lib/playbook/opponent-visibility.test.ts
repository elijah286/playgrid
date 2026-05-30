/**
 * resolveOpponentHiddenOnLoad — a play saved as "Offense vs Defense" must SHOW
 * its defense when opened, never open blank behind a "Show" button.
 *
 * Surfaced 2026-05-29: a coach opened "Taper Fade vs Cover 1 Man" (a play with
 * a fully-attached custom-opponent defense) and saw ONLY the offense — the
 * OPPONENT panel read "Custom opponent [hidden]" with a "Show" button. Root
 * cause: `opponent_hidden` (the in-session Clear/peek toggle) had been
 * persisted to the DB, and getPlayForEditorAction returned it verbatim, so the
 * saved defense loaded hidden. The toggle must be a within-session peek only —
 * a real attached custom opponent always shows on load.
 *
 * This pins the load-time decision: a non-null customOpponentPlayId ⇒ visible,
 * regardless of the persisted opponent_hidden flag.
 */
import { describe, expect, it } from "vitest";
import { resolveOpponentHiddenOnLoad } from "./opponent-visibility";

describe("resolveOpponentHiddenOnLoad — saved custom opponent always shows", () => {
  it("forces the defense visible when a custom opponent is attached, even if persisted hidden=true (the 'Taper Fade vs Cover 1 Man' regression)", () => {
    expect(resolveOpponentHiddenOnLoad("child-play-id", true)).toBe(false);
  });

  it("keeps the defense visible when attached and not persisted-hidden", () => {
    expect(resolveOpponentHiddenOnLoad("child-play-id", false)).toBe(false);
  });

  it("passes the flag through when no custom opponent is attached (nothing to show, value is inert)", () => {
    expect(resolveOpponentHiddenOnLoad(null, true)).toBe(true);
    expect(resolveOpponentHiddenOnLoad(null, false)).toBe(false);
  });
});
