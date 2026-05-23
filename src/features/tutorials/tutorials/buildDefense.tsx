import type { TutorialDef } from "../engine/types";

/**
 * Build-a-defense lesson. Spans two surfaces:
 *
 *   1. Playbook page — open the New Play dialog, pick Defense, choose
 *      a formation (or start blank).
 *   2. Play editor — the picker navigates into the editor where the
 *      coach drops zones, installs movements, and (optionally) tests
 *      the defense against an existing offensive play via the
 *      "Install vs this play" affordance on the opponent picker.
 *
 * Tour state persists across the navigation because TutorialProvider
 * lives at the app root. Step 4's `advance: { kind: "appear", key:
 * "editor-canvas" }` auto-advances when the editor mounts.
 */
export const BUILD_DEFENSE_TUTORIAL: TutorialDef = {
  id: "defense_v1",
  title: "Build a defense",
  summary:
    "Author a standalone defensive play — pick a defense formation, drop zones, install movements, and test it against an offense. ~3 minutes.",
  supportedVariants: ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"],
  steps: [
    {
      id: "welcome",
      title: "Defenses are first-class plays",
      body: () =>
        "Just like an offensive play, a defense lives in your playbook and can be installed against any matchup. This tour walks the whole loop — new play → pick Defense → drop zones and movements → save and install.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "open-new-play",
      title: "Start a new play",
      body: () =>
        "Tap New play to open the picker. You'll choose the play type next.",
      anchor: { kind: "anchor", key: "new-play-button" },
      advance: { kind: "next" },
      dimBackground: false,
      gate: {
        kind: "anchor-present",
        key: "new-play-dialog",
        hint: "Tap New play to continue",
        latched: true,
      },
    },
    {
      id: "pick-defense",
      title: "Tap the Defense tab",
      body: () =>
        "Tap the Defense tab — then pick a defensive play to continue. You'll see common alignments for your variant (4-3, 3-4, dime, etc.) plus any defense formations you've already saved. Each option creates a play with the right number of defenders pre-placed.",
      anchor: { kind: "anchor", key: "new-play-defense-section" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "land-in-editor",
      title: "Pick a defensive play",
      body: () =>
        "Tap a template (or your own saved formation) to drop defenders onto a fresh play. Each option pre-places the right number of defenders so you can jump straight into drawing zones and movements.",
      anchor: { kind: "anchor", key: "new-play-defense-section" },
      // Auto-advance once we land in the editor — the canvas mounts as
      // soon as navigation completes from the picker.
      advance: { kind: "appear", key: "editor-canvas" },
      dimBackground: false,
    },
    {
      id: "draw-zones",
      title: "Draw coverage zones",
      body: () =>
        "Tap any defender to surface the toolbar above the field. Defense plays get two zone tools — a rectangle and an ellipse — in place of the offensive route templates. Tap one, then tap the field to drop the zone where you want coverage.",
      anchor: { kind: "anchor", key: "editor-canvas" },
      advance: { kind: "next" },
      dimBackground: false,
      // Pre-select a defender on entry so the toolbar (with zone tools)
      // is immediately visible. ensure-player-selected picks the first
      // player on the play regardless of side — for defense plays that's
      // a defender.
      onEnter: { kind: "ensure-player-selected" },
      // Whitelist the route toolbar so the coach can tap the zone
      // buttons without the click block eating their tap.
      allowAnchors: ["route-toolbar", "route-toolbar-add-zone"],
    },
    {
      id: "install-movements",
      title: "Install movements",
      body: ({ pointer }) =>
        pointer === "touch"
          ? "Drag a defender to reposition. Press-and-hold a defender for the quick-actions menu — set motion, change speed, or flip horizontally. Same menu offensive players use; the actions adapt to the side."
          : "Drag a defender to reposition. Right-click a defender for the quick-actions menu — set motion, change speed, or flip horizontally. Same menu offensive players use; the actions adapt to the side.",
      anchor: { kind: "anchor", key: "editor-canvas" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "install-vs-offense",
      title: "Test it against an offense",
      body: () =>
        "Clear your selection (tap empty field) to surface the opponent picker on the right. Search for an offensive play to scout — once you pick one, an \"Install vs this play\" button appears. Tapping it locks the matchup, snapshotting the offense alongside your defense.",
      anchor: { kind: "anchor", key: "opponent-overlay" },
      advance: { kind: "next" },
      dimBackground: false,
      onEnter: { kind: "clear-selection" },
    },
    {
      id: "done",
      title: "You're set",
      body: () =>
        "That's the defensive workflow: New play → Defense → drop zones and movements → install against an offense. Your defense lives in the playbook just like any other play — open it any time from the Plays list to edit.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
      nextLabel: "Got it",
    },
  ],
};
