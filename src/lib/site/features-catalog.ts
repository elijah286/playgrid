/**
 * Feature catalog — the canonical inventory of capabilities shipped in
 * Playgrid. Surfaced read-only in Site Admin → Features for marketing
 * planning, sales conversations, and changelog reference.
 *
 * **MAINTENANCE RULE.** Whenever you ship a new user-facing feature or
 * capability, add an entry here in the same commit. Bug fixes and
 * internal refactors do NOT belong here — only things a coach, admin,
 * or marketing person could meaningfully describe in a sentence.
 *
 * Order within a category is roughly newest-first; the rendered admin
 * view groups by category and shows `addedDate` as a small subtitle.
 */

export type FeatureCategory =
  | "Playbook"
  | "Plays & formations"
  | "Calendar & scheduling"
  | "Roster & sharing"
  | "Coach AI"
  | "Game mode"
  | "Print & export"
  | "Billing & accounts"
  | "Marketing site"
  | "Onboarding & help"
  | "Admin tools"
  | "League operations";

export type FeatureStatus = "ga" | "beta" | "internal";

export type FeatureEntry = {
  /** Stable id — kebab-case, unique within the catalog. */
  id: string;
  /** Short noun-phrase title. Marketing-friendly. */
  name: string;
  /** 1-2 sentence description focused on user value. No internals. */
  description: string;
  category: FeatureCategory;
  /** "ga" = available to coaches, "beta" = behind a flag, "internal" = admin-only. */
  status: FeatureStatus;
  /** ISO date (YYYY-MM-DD) the feature first shipped. Best-effort for legacy entries. */
  addedDate: string;
};

export const FEATURES: FeatureEntry[] = [
  // ── Playbook ─────────────────────────────────────────────────────
  {
    id: "offline-auto-cache",
    name: "Automatic offline playbooks",
    description:
      "In the app, every one of a coach's playbooks downloads automatically and stays fresh in the background, so the whole library is available offline on the sideline — no need to tap 'download' on each one.",
    category: "Playbook",
    status: "beta",
    addedDate: "2026-06-30",
  },
  // ── Roster & sharing ─────────────────────────────────────────────
  {
    id: "join-puts-you-on-roster",
    name: "Joining puts players on the roster",
    description:
      "When a player accepts an invite, they're added to the roster automatically — their name plus the position they picked. Coaches who want to vet new members can flip on 'approve new players,' which makes joiners show as tentative until the coach confirms them. Players who match a name the coach pre-added can claim that spot to merge into it.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-06-26",
  },
  {
    id: "content-reporting",
    name: "Report objectionable content",
    description:
      "Coaches and players can report objectionable content or abusive behavior — on team messages, shared plays, and Coach Cal responses — right from where they see it. Reports land in a review queue, and we act on violations, including removing content and suspending accounts. Objectionable display names and roster labels are also filtered automatically.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-06-18",
  },
  {
    id: "remove-and-ban-member",
    name: "Remove & ban a member",
    description:
      "Playbook owners and coaches can remove a member and ban them, so they can't rejoin through an invite link. Keeps team chat and shared playbooks clear of abusive users; bans can be lifted later.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-06-18",
  },
  // ── Billing & accounts ───────────────────────────────────────────
  {
    id: "coach-plan-welcome-email",
    name: "Welcome email from the founder",
    description:
      "Every coach who buys the Team Coach plan gets a personal welcome email from the founder — thanking them for the purchase, framing XO Gridmaker as a new product we're building fast, and inviting their questions, concerns, and feedback. Replies go straight to the founder's inbox. Sent automatically on purchase and once per coach.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-06-29",
  },
  {
    id: "revenue-customer-value-dashboard",
    name: "Customer value & referral-network dashboard",
    description:
      "The admin Revenue tab lists every customer who has ever paid — active, cancelled, or one-time — with a status badge (a red 'Cancelled' flag for churned subscribers and an amber 'Canceling' flag with the end date for those set to lapse). The list sorts by lifetime spend, network value, referral count, or join date. Clicking a customer opens a detail panel showing their time on site, when they were last active, when a cancelling subscription ends, and their full referral network: the people who signed up because of them, the people those people referred, and the total dollar spend across that entire downstream tree — so the most influential, highest-value users are easy to spot. Referrals count both copy-link signups and players who joined a coach's playbook via invite.",
    category: "Billing & accounts",
    status: "internal",
    addedDate: "2026-06-29",
  },
  {
    id: "ios-in-app-purchase",
    name: "Subscribe on iPhone (App Store)",
    description:
      "Coaches can buy the Team Coach plan directly inside the iOS app via Apple in-app purchase, billed and managed through their Apple account. A subscription unlocks the same account whether it was bought on the web or on iPhone, and App Store purchasers are sent to iPhone Settings to manage or cancel. Web purchases continue through Stripe.",
    category: "Billing & accounts",
    status: "beta",
    addedDate: "2026-06-13",
  },
  // ── Calendar & scheduling ────────────────────────────────────────
  {
    id: "native-game-practice-reminders",
    name: "Game & practice reminders (app)",
    description:
      "Set on-device reminders for upcoming games and practices from the installed app. Alerts are scheduled locally and fire even with no signal and when the app is closed, so a coach gets a heads-up before kickoff to pull up the right plays. App-only; the mobile-web build shows an install nudge instead.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-06-11",
  },
  // ── Onboarding & help ────────────────────────────────────────────
  {
    id: "tutorial-play-authoring",
    name: "Guided Play Authoring tutorial",
    description:
      "A hands-on tour of creating and editing plays — picking and moving players, drawing and styling routes, motion and quick edits, scouting the defense, and writing notes. The tour spotlights the real editor UI step by step with reactive try-it checklists that tick as the coach actually does each action, adapts copy to the playbook's sport variant and the input modality (mouse vs touch), and can be replayed anytime from the Learning Center. Auto-offers to new coaches on their second editor visit; one-tap dismiss is sticky.",
    category: "Onboarding & help",
    status: "ga",
    addedDate: "2026-05-14",
  },
  {
    id: "tutorial-build-defense",
    name: "Guided Build-a-Defense tutorial",
    description:
      "An 8-step hands-on tour of authoring a standalone defensive play. Walks the coach from the playbook page's New Play button into the dialog, highlights the Defense section as the play type, follows the navigation into the play editor, then teaches drawing coverage zones, installing movements via the quick-actions menu, and locking the defense against an offensive play via the opponent picker's \"Install vs this play\" button. Spans two surfaces (playbook → editor) and persists across the navigation; replayable anytime from the Learning Center.",
    category: "Onboarding & help",
    status: "ga",
    addedDate: "2026-05-22",
  },
  {
    id: "tutorial-use-formations",
    name: "Guided Use-Formations tutorial",
    description:
      "A hands-on tour of the formation picker — opening it from the header, searching by name, browsing the grid or list view, applying a saved formation to the current play, saving the current player layout as a new formation, and unlinking a play from a formation while keeping the layout. Spotlights the picker, search input, save-as-new button, and unlink button with reactive checklists; replayable anytime from the Learning Center.",
    category: "Onboarding & help",
    status: "ga",
    addedDate: "2026-05-22",
  },
  {
    id: "tutorial-create-practice-plan",
    name: "Guided Create-Practice-Plan tutorial",
    description:
      "A hands-on tour of the practice plan editor — naming the plan, adding a timeline block, setting start time and duration, splitting a block into parallel activities (Skill / Line / Specialists lanes), and saving plus printing for the coaching staff. Spotlights the title input, add-block button, block editor panel, add-lane button, and the save / print buttons with reactive checklists. Launches from the Learning Center by creating a fresh \"Tutorial practice plan\" in the playbook the coach picks.",
    category: "Onboarding & help",
    status: "ga",
    addedDate: "2026-05-22",
  },
  {
    id: "tutorial-use-game-mode",
    name: "Guided Use-Game-Mode tutorial",
    description:
      "A 7-step walkthrough of the sideline Game Mode flow — game vs scrimmage, picking the next play from a wristband-friendly searchable picker, scoring with thumbs-up / thumbs-down and outcome tags, and tracking the running scoreboard for game sessions. Spotlights the choose-next-play button and the scoreboard; the remaining steps are concept-only since they describe in-session actions that vary by session state. Launches directly into the playbook's Game Mode (entitlement-gated to Coach+ tier).",
    category: "Onboarding & help",
    status: "ga",
    addedDate: "2026-05-22",
  },
  {
    id: "tutorial-print-plays",
    name: "Guided Print-Plays tutorial",
    description:
      "A 6-step tour of the print preview page — picking a format (call sheet, playbook, wrist coach), reading the live preview, opening the Customize panel for diagram scale and label toggles, and exporting via the browser print dialog or direct PDF download. Spotlights the format / customize sections, the live preview pane, and the Print + PDF buttons. Launches from the Learning Center directly into the playbook's print page.",
    category: "Onboarding & help",
    status: "ga",
    addedDate: "2026-05-22",
  },
  // ── Playbook ─────────────────────────────────────────────────────
  {
    id: "playbook-create",
    name: "Custom playbooks",
    description:
      "Coaches create one or more playbooks per team, tagged by sport variant (flag 5v5/7v7, tackle 11), season, and league.",
    category: "Playbook",
    status: "ga",
    addedDate: "2025-01-01",
  },
  {
    id: "playbook-archive",
    name: "Archive + trash",
    description:
      "Coaches can archive a playbook to hide it from active rotation while preserving plays, and restore from trash within the retention window.",
    category: "Playbook",
    status: "ga",
    addedDate: "2025-06-01",
  },
  {
    id: "playbook-version-history",
    name: "Version history",
    description:
      "Every play save creates an immutable version. Coaches can browse history, diff edits, and restore prior versions.",
    category: "Playbook",
    status: "ga",
    addedDate: "2025-07-01",
  },
  {
    id: "playbook-team-color",
    name: "Team branding (logo + color)",
    description:
      "Each playbook carries a team logo and accent color used across the header, shared invites, calendar, and the Coach Cal chat panel.",
    category: "Playbook",
    status: "ga",
    addedDate: "2025-09-01",
  },
  {
    id: "playbook-center-eligible",
    name: "Center-is-eligible toggle",
    description:
      "Per-playbook game rule that marks the center as an eligible receiver. On by default for flag 5v5 (where C is just the snapper, not a lineman) and off for 7v7/tackle/other. Drives the play editor and Coach Cal so every 5v5 pass play assigns C a route.",
    category: "Playbook",
    status: "ga",
    addedDate: "2026-05-01",
  },
  {
    id: "playbook-bulk-select-group-and-shift",
    name: "Group select-all and shift-click range in the play list",
    description:
      "When a coach taps Select on the playbook, every group header (e.g. \"Mesh Split\", \"Ungrouped\", \"Offense\") now shows its own checkbox that bulk-toggles every play under that header — empty/partial/all states with an indeterminate dash for partial. Shift-click on a play card or list-row checkbox extends the selection from the last-clicked play through the clicked one in visual order, mirroring Finder/Explorer behavior. Cuts the click count for common bulk actions (print a group, archive a section, delete legacy plays) from one-per-play to one-per-group.",
    category: "Playbook",
    status: "ga",
    addedDate: "2026-05-04",
  },
  {
    id: "playbook-bulk-copy-and-move",
    name: "Bulk copy and move-to-group from the playbook",
    description:
      "The bulk-selection toolbar now has Copy and Move alongside Archive, Delete, and Print. Copy reuses the same dialog as the single-play action — including cross-playbook copy with formation handling (deep-clone, drop, or pick a destination formation) — and runs once per selected play. Move-to-group reassigns every selected play to the chosen group (or Ungrouped) in one pass. On phones, the secondary actions collapse to icon-only buttons inside a two-row pill so all five actions still fit comfortably; full labels return on tablet and desktop.",
    category: "Playbook",
    status: "ga",
    addedDate: "2026-05-05",
  },

  // ── Plays & formations ──────────────────────────────────────────
  {
    id: "photo-play-import",
    name: "Import plays from a photo",
    description:
      "Photograph a printed play sheet (Playmaker X and similar exports) or a clear hand-drawn play, and the importer reads it into a real, editable play: it finds each play panel on the sheet, identifies every player's route from the app's own route catalog (family, depth, break direction), and drafts the play in the target playbook's formation vocabulary. Nothing saves automatically — the coach reviews the draft side-by-side with the photo, with a confidence badge on every route and one-tap corrections, then saves. Imported plays are full citizens: same diagram engine, auto-generated notes, and version history as any other play. Photos are processed in-flight and never stored. Metered per month; behind the photo_play_import beta flag.",
    category: "Plays & formations",
    status: "beta",
    addedDate: "2026-07-03",
  },
  {
    id: "qb-progression-numbers",
    name: "QB progression (read-order) numbers on receivers",
    description:
      "Label receivers 1, 2, 3… in the order the QB should read them. Each numbered receiver gets a small amber badge next to their token in the play diagram and in playbook thumbnails, so a young QB can glance at a wristband card and know exactly where to look first, second, and third. The read order also drives the \"Progression\" block in the play notes — listing receivers in that exact sequence instead of the default depth-based guess. Coach Cal can set the progression when it composes a play, and it round-trips through the spec so editing the play keeps the numbers in sync. Only receivers running routes can be numbered; blockers and runners can't accidentally land in the read order.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-28",
  },
  {
    id: "user-route-templates",
    name: "Save your own routes to Quick Routes",
    description:
      "Drew a route you'll want to use again? Right-click the player and pick \"Save as template,\" give it a name, and it shows up in the Quick Routes panel under \"Your routes\" — visible only to you, ready to apply to any player on any play in one tap. The saved template keeps its shape AND its visual style (color, weight, dashed-vs-solid), so a dashed block-and-release or a curved wheel comes back exactly how you drew it. Rename or delete your routes from the panel anytime. Routes mirror automatically when applied to the opposite side of the formation, the same way the system routes do, so one \"My slant\" works for both X and Z.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-18",
  },
  {
    id: "defender-movement-paths",
    name: "Defender movement paths in the editor",
    description:
      "Defenders are now first-class authors of movement, not just tokens you reposition. Select any defender on a defense play and drag from the field to draw the path they take at the snap — rotation down to the flat, blitz angle, post-snap zone shift, anything you'd diagram on a whiteboard. Same gesture works on the custom-opponent overlay of an offensive play: tap an overlay defender and draw their reaction without leaving the offense view (changes stay local to that offensive play — your saved coverage stays pristine). Paths render the same way offensive routes do (straight or curved, with arrowheads) and round-trip through Coach Cal so the spec stays the source of truth: Cal can read the movement to explain it, edit it, or generate notes that describe each defender's job by name. Toolbar gives a clear-movement button per defender so you can wipe and redraw without touching anything else.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-09",
  },
  {
    id: "editor-field-customization",
    name: "Customizable field markings in the play editor",
    description:
      "Coaches can dial in the field to match their league directly from the play editor footer. The Markings popover lets you add, remove, and tune individual no-run / pass-only zones (each with its own yardage and depth) and fixed down-marker yard lines, so a 5v5 league can show midfield + scoring approach bands while a 7v7 league shows none — or anything in between. Field width and length are also adjustable in 5- and 10-yard steps for non-standard fields. Everything saves as a per-team default and applies across every play in the playbook.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-08",
  },
  {
    id: "play-landscape-fullscreen",
    name: "Fullscreen landscape play view on phones",
    description:
      "Rotate a phone to landscape on any play and the editor chrome drops away — the field fills the viewport with black bars on either side. Tap anywhere to step through motion → snap → done → replay. Built for the sideline use case where a coach wants the biggest possible diagram with zero buttons in the way.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-07",
  },
  {
    id: "play-editor-mobile-sticky",
    name: "Mobile play editor: sticky field + always-visible notes",
    description:
      "On phones, the play diagram pins under the global header as you scroll, so the play stays visible while you read the notes, playback controls, and opponent below it. Notes now show in a collapsible card directly under the field in both view and edit modes — no need to enter edit mode just to read them.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "play-route-speed",
    name: "Per-route and per-segment speed",
    description:
      "Right-click a player to set their entire route to 75%, 100%, or 125% of default playback speed, or right-click a single segment to speed up or slow down just that part of the route.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "play-route-delay",
    name: "Per-player route delay",
    description:
      "Right-click a player to delay when they start their route by 1–5 steps after the snap, while the rest of the play moves normally. A small clock badge marks delayed players, and a note explaining the delay is added automatically.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "play-editor",
    name: "Play editor",
    description:
      "Drag-and-drop editor for drawing plays — players, routes, motion, blocking schemes, and labeled zones. Supports flag 5v5 / 7v7 and tackle 11 with variant-aware rules.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2025-01-01",
  },
  {
    id: "play-animation",
    name: "Animated playback",
    description:
      "Press play to watch routes animate in real time, including pre-snap motion, with adjustable playback speed.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2025-03-01",
  },
  {
    id: "play-route-templates",
    name: "Canonical route templates",
    description:
      "Quick-pick standard routes (slants, hitches, posts, corners, fades, etc.) authored to consistent geometry across the app.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2025-04-01",
  },
  {
    id: "play-formations",
    name: "Saved formations",
    description:
      "Reusable starting formations attached to a playbook. New plays inherit the formation's player layout.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2025-02-01",
  },
  {
    id: "play-opponent-overlay",
    name: "Opponent formation overlay",
    description:
      "Drop an opposing formation on top of any play (gray, no routes) so coaches can visualize matchups against a specific look.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2025-08-01",
  },
  {
    id: "play-custom-opponent",
    name: "Custom opponent picker + Save-as-defense",
    description:
      "Coaches can build a one-off opponent overlay inline on a play, or save it as a reusable defensive formation in the playbook.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-04-25",
  },
  {
    id: "defense-view-offense-routes",
    name: "View offense routes on installed-vs defense plays",
    description:
      "When a defense play is installed against a specific offense, a 'View offense routes' toggle on the Installed vs card overlays the offense's route arrows in gray on the field. Off by default — flip it on while drawing the defensive reaction, then off to see the defense alone.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-04-30",
  },
  {
    id: "play-notes",
    name: "Play notes with @Player mentions",
    description:
      "Free-form notes attached to each play. Type @F or @yellow to link directly to a player token in the diagram.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2025-05-01",
  },
  {
    id: "play-notes-copy",
    name: "Copy play notes with formatting preserved",
    description:
      "A Copy button on the play notes card writes both rich-text HTML and plain-text markdown to the clipboard. Pastes into Gmail, Slack, Apple Notes, or Word with bold, lists, and headings intact, and falls back to clean readable markdown in plain-text fields.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-06",
  },
  {
    id: "play-tags-groups",
    name: "Play tags and groups",
    description:
      "Organize plays by user-defined tags (run, pass, red zone) and stack them into named groups for play calling.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2025-04-01",
  },

  // ── Calendar & scheduling ──────────────────────────────────────
  {
    id: "push-notifications",
    name: "Mobile push notifications",
    description:
      "Coaches and players with the iOS / Android app installed get push notifications for everything that lands in their inbox: practice and game reminders (and when an event is added, changed, or cancelled), play updates a coach broadcasts, new team messages, join and coach-access requests and roster claims on playbooks they own, and playbooks shared with them. Tapping a notification deep-links straight to the relevant screen. Everything is on by default; coaches control it with grouped on/off switches in Account → Notifications (Team activity, Schedule & RSVPs, Requests & approvals, Shares & mentions), while critical account & security alerts stay always-on. Respects the device's OS permission; the device token is dropped on sign-out.",
    category: "Calendar & scheduling",
    status: "beta",
    addedDate: "2026-05-28",
  },
  {
    id: "calendar-bulk-rsvp",
    name: "Bulk RSVP and series rollup",
    description:
      "Recurring events (e.g. every Friday practice) collapse into a single card showing the next date and how many still need a response — one tap RSVPs to all unanswered occurrences at once. For ad-hoc bursts (a tournament weekend, six scrimmages Cal scheduled in one go), tap Select to enter multi-select mode, pick the events that apply, and apply Going / Maybe / Can't go from the sticky action bar. Past occurrences are excluded automatically. Works on both the global Calendar tab and per-team calendar.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-05-18",
  },
  {
    id: "calendar-events",
    name: "Practices, games, and events",
    description:
      "Per-playbook calendar with practices, games, scrimmages, and other events. Supports recurrence, locations, and arrival times.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-01-01",
  },
  {
    id: "calendar-rsvp",
    name: "RSVP tracking",
    description:
      "Players RSVP yes/maybe/no per occurrence. Coaches see attendee lists and aggregate counts.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-01-15",
  },
  {
    id: "calendar-feed",
    name: "Calendar subscribe (.ics)",
    description:
      "Each playbook exposes an iCal feed so members can subscribe from Apple/Google/Outlook calendars.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-02-01",
  },
  {
    id: "calendar-game-results",
    name: "Game results",
    description:
      "Record final scores against opponents post-game; results page summarizes the season.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-03-01",
  },
  {
    id: "team-messaging",
    name: "Team chat",
    description:
      "Per-playbook chat where coaches, players, and parents trade messages about practices, equipment, and schedule. Realtime delivery with typing indicators, markdown formatting, clickable links, and a 15-minute self-edit window. The owner can disable messaging or clear history per playbook; duplicating a playbook offers an opt-in to carry message history forward. On mobile, the playbook detail page swaps the top tab strip for a thumb-reachable bottom nav with a red unread badge on the Chat icon.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-05-06",
  },

  // ── Roster & sharing ───────────────────────────────────────────
  {
    id: "inbox-global-bell",
    name: "Global inbox bell",
    description:
      "An inbox bell with unread badge that follows the coach everywhere — desktop site header, mobile playbook chrome, and the play editor. Items from every playbook surface in one drawer grouped by team, so a coach drawing a play in Playbook A still sees a pending RSVP or join request from Playbook B without backing out to the lobby. Refreshes every minute while the tab is open; tapping a row jumps to the right surface (RSVP items deep-link to the calendar event; others land in the full inbox tab).",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-05-23",
  },
  {
    id: "roster",
    name: "Team roster",
    description:
      "Per-playbook roster with names, jersey numbers, positions. Players can be invited as members of the playbook.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2025-06-01",
  },
  {
    id: "roster-free-tier-build",
    name: "Free-tier roster building",
    description:
      "Coaches on the free tier can add, rename, and edit their full roster (names, jersey numbers, positions) inside any playbook.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-05-01",
  },
  {
    id: "player-invite-policy",
    name: "Player-invite policy",
    description:
      "Owner-controlled per-playbook setting that decides whether players (viewers) can invite other players. Three options: disabled (default — only coaches can invite), approval (players can invite, but new joiners land in pending until the owner approves them in the Roster tab), and open (players can invite, new joiners get immediate access). Default is disabled so existing playbooks behave as before; owners opt in from Manage → Player invitations… in the playbook action menu. When enabled, viewers see the Share button (which jumps straight to a player-invite QR/link — Send a copy and Co-coach stay coach-only).",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-05-05",
  },
  {
    id: "free-tier-player-invites",
    name: "Free-tier player invites",
    description:
      "Solo (free) coaches can invite unlimited players to their playbook as read-only viewers. Players get the team calendar (practices, games, scrimmages with RSVPs), see the playbook, and receive game-day comms. Inviting another coach to collaborate (editor role) and sending a copy of the playbook to another coach remain Team Coach features. Replaces the prior model where any sharing required Team Coach.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-05-04",
  },
  {
    id: "free-tier-team-calendar",
    name: "Free-tier team calendar",
    description:
      "The team calendar (events, RSVPs, ICS subscribe feed, game results) is now free for every coach. A solo coach can run their team's schedule without paying — practices, games, scrimmages, RSVPs, and one-tap directions all included. Practice plans remain Team Coach because they're a planning surface for the coaching staff, not a player-facing schedule.",
    category: "Calendar & scheduling",
    status: "ga",
    addedDate: "2026-05-04",
  },
  {
    id: "roster-invites",
    name: "Invite team members",
    description:
      "Coaches generate links/codes that grant view or edit access to a playbook. Player invites (role: viewer) are free for every owner — no cap. Coach (role: editor) invites consume Team Coach seats and require the owner to be on Team Coach or above.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2025-07-01",
  },
  {
    id: "playbook-duplication-controls",
    name: "Duplication controls",
    description:
      "Per-playbook toggles for whether other coaches, players, or game results can be duplicated from a shared playbook.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2025-10-01",
  },
  {
    id: "global-share-button",
    name: "Global share button",
    description:
      "A persistent Share button lives in the global nav across landing pages, the dashboard, formation editor, and (mobile) the play editor. Opens a dialog that copies a tracked link (xogridmaker.com/?ref=<userId> for signed-in users), offers native iOS share sheet inside the app, and shows a QR for in-person passes. When the give-and-get program is on (Site Admin → Site Settings), the dialog surfaces the current days-per-award offer in a primary banner so the incentive is visible at the moment the coach decides to share.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "home-browse-examples",
    name: "Browse examples link on /home",
    description:
      "A small \"Browse example playbooks →\" link sits next to the New Playbook button on the dashboard home, and again under the empty-state tile when the coach has no playbooks yet. Routes to the existing /examples gallery so coaches can discover starter playbooks without leaving the app. Quota disclosure on the example claim page handles the 1-free-playbook constraint at click time.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-05-01",
  },
  {
    id: "claim-flow-signup-heading",
    name: "Claim-flow signup heading",
    description:
      "When a coach lands on /login from a copy or example claim link (any next=/copy/* param), the page heading defaults to \"Get started\" instead of \"Welcome back\" — most claim-link clickers are net-new users, and the welcome-back framing made them think they had a forgotten account. Heading still flips to \"Welcome back\" once AuthFlow's email step confirms an existing account.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-05-01",
  },
  {
    id: "name-capture-prompt",
    name: "One-time name prompt",
    description:
      "Coaches who never set a display name (older OTP-only signups, accounts that predate the new-user-profile step) get a one-time, dismissible \"What should we call you?\" modal on next dashboard visit. Triggered when profiles.display_name is null OR equals the user's email — the legacy default. Saves to profiles.display_name; remembers dismissal in localStorage so it doesn't reappear on every navigation. Closes the loop on the \"why is this coach showing up as their email?\" rosters issue.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "share-link-smart-deep-link",
    name: "Share-link smart deep-link",
    description:
      "When a recipient clicks a /copy or /invite link for a playbook they're already an active member of, they're routed straight to the playbook with no dialog or duplicate copy created. Eliminates the \"wait, why is it asking me to claim again?\" moment when forwarded links land with people who already have access.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "playbook-header-team-coach-locks",
    name: "Locked menu items show \"Team Coach\" badge",
    description:
      "In the playbook header overflow menu, items that require Team Coach (Invite team member, Send a copy, Duplicate) now display a small lock badge for free users instead of revealing they're locked only on click. The full upgrade modal still fires when the item is clicked.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "referral-rewards",
    name: "Referral rewards (admin-controlled)",
    description:
      "Optional growth lever: when a coach sends a copy of their playbook and a brand-new user (zero owned playbooks) claims it, the sender earns Team Coach days as a thank-you. Off by default. Site Admin → Site Settings exposes a toggle, days-per-award input, lifetime cap input, and a No-cap checkbox. Idempotent (each recipient can only mint one award) and self-referral-proof. Awards stack by extending the sender's active referral comp_grant. Surfaced to coaches via a small \"earn N days of Team Coach\" line on the Send-a-copy card in the Share dialog when enabled.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "billing-purchase-flow-overhaul",
    name: "Seamless purchase + post-purchase celebration across plans",
    description:
      "Three coordinated changes so the purchase flow doesn't lose the coach between intent and value. (1) Coach Cal preview CTAs now go straight to Stripe Checkout for free users instead of bouncing through the /pricing comparison page — the click already declared Coach Pro intent. (2) Team Coach subscribers now get the same celebration treatment Coach Pro users do (welcome dialog on /home, sparkle header, feature checklist), but with action-oriented starter cards (create playbook, invite assistant, set up team calendar, build a practice plan) instead of AI starter prompts since Team Coach doesn't include Cal. (3) Paid Team Coach users get a primary \"Upgrade to Coach Pro\" button on the Account → Plan card alongside Manage billing; clicking it deep-links to /pricing?upgrade=coach_ai which auto-opens the proration modal on arrival. Previously the only in-app upgrade path from Team Coach was via Coach Cal's upsell.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-05-22",
  },
  {
    id: "coach-pro-welcome-celebration",
    name: "Coach Pro upgrade celebration + Cal starter prompts",
    description:
      "After a successful Coach Pro upgrade (whether from free or from Team Coach), the coach lands on /home with a celebration dialog instead of the silent account page. The dialog confirms the upgrade went through, summarises what Coach Pro includes, and surfaces four hand-picked starter prompts — clicking one opens Coach Cal with the prompt pre-loaded and auto-submitted so the coach experiences the AI value on their first interaction instead of staring at an empty chat. The welcome marker is server-validated against the user's actual entitlement so pasting the URL on a free account doesn't trigger a fake celebration, and the dialog strips itself from the URL on mount so a refresh / back-navigation can't replay it. Same commit also fixes the previous \"upgrade looks broken\" bug where the post-upgrade page rendered the old tier because the local subscriptions row was waiting for the Stripe webhook — the upgrade action now mirrors the new tier into our DB optimistically right after the Stripe API call returns.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-05-22",
  },
  {
    id: "coach-pro-7-day-trial",
    name: "Coach Pro 7-day free trial actually wired up",
    description:
      "Pricing copy and the Coach Cal promo popover both promised \"7-day free trial · no charge today\" but the Stripe Checkout session was charging $25 immediately. Now the checkout adds trial_period_days: 7 for first-time Coach Pro subscribers (looked up via the subscriptions table — any historical coach_ai row disqualifies, so cancel-and-resub doesn't farm fresh trials). Trial subscriptions cancel at trial end if no payment method is on file.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "coach-ai-eval-window-configurable",
    name: "Configurable Coach Cal trial window",
    description:
      "The Coach Pro free-trial length is now an admin setting (Site admin → Site → \"Coach Cal eval window\") instead of a hardcoded 7. The single value drives Stripe checkout's trial_period_days for new subscriptions and every trial-mention on marketing surfaces — the pricing page card + footnote, the FAQ answers, the /coach-cal landing hero/pricing card/final CTA, the header chat preview, the per-CTA upsell preview shown when a non-entitled coach clicks an in-app Coach Cal trigger, and the floating playbook upgrade card. Changing the value never shrinks an existing trial: Stripe stamps current_period_end at checkout, so the change only applies to new sign-ups going forward.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-05-04",
  },
  {
    id: "playbook-share-flow-unified",
    name: "Unified share flow on mobile and desktop",
    description:
      "Picking a role card in the Share dialog (Add a co-coach / Add a player) now jumps directly to a QR code on both mobile and desktop. Defaults (auto-approve up to 25 joiners, link valid 14 days) match what every owner picked anyway, so the configuration form between role-pick and QR has been retired. The mobile-only auto-jump effect that used to race the user's click on the cards is gone, fixing the flicker where Add-a-co-coach briefly showed before bouncing to a player QR. The redundant \"More options\" escape-hatch is replaced with a clear Back button plus a \"Send by email instead\" affordance on the QR screen.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "playbook-share-mobile-button",
    name: "Mobile Share button on the playbook header",
    description:
      "On mobile inside a playbook, the Share / Invite action used to live only in the overflow menu — buried for a high-leverage growth flow. Promoted to a visible icon button next to the Coach Cal launcher on the playbook header banner. Mirrors the desktop \"Share\" button.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "playbook-share-dialog-ia",
    name: "Share dialog reframe",
    description:
      "What used to be \"Invite team member\" is now \"Share this playbook\" with three peer-level options at the top: Send a copy (give a coach a starter playbook of their own), Add a co-coach (collaborate on this playbook), and Add a player (view-only). Replaces the old Player/Coach role toggle and the apologetic \"Two kinds of coach invite\" panel — Send a copy is now elevated as the most viral primitive instead of buried under coach-invite.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "playbook-share-first-banner",
    name: "First-share nudge banner",
    description:
      "Owners with no co-coaches and no outstanding invites see a slim banner at the top of the playbook reminding them they can share it. Disappears as soon as someone is added or invited. Drives the first share — typically the most consequential one for the network effect.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "push-dormant-token-reliability",
    name: "Reliable push for dormant users",
    description:
      "Notifications keep reaching parents and players who log in once and rarely reopen the app. The native apps now re-report a rotated push token even when killed — Android forwards FCM token refreshes from a background service, and iOS refreshes via a silent background push — authenticated by a per-device secret so no app session is needed. Site Admin → Notifications shows token-health metrics (reachable users, platform split, freshness buckets, dead-token reasons) so coverage gaps are visible before they bite.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-06-15",
  },
  {
    id: "rating-nudge-sentiment-gate",
    name: "Smart App Store rating nudge",
    description:
      "The in-app rating nudge now asks \"are you enjoying the app?\" before ever inviting a public review. Coaches who say yes are sent to the App Store rating sheet; coaches who say no are quietly routed to a private feedback box instead of a 1-star review — steering happy sentiment to the stores and unhappy sentiment to the team. The Site admin inbox records the whole funnel: who was shown the nudge and when, then whether that coach left a review (with a link to the store's reviews page), dismissed the prompt, or sent private feedback (which lands in the Feedback tab).",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-07-02",
  },
  {
    id: "site-admin-operational-push-alerts",
    name: "Site admin · Operational push alerts",
    description:
      "Site admins with the app installed get a device push the moment something operationally meaningful happens: a new user signs up, a paid subscription is purchased, or a subscription is cancelled. These mirror the existing admin \"system notices\" inbox feed but reach the phone in real time, so the admin doesn't have to refresh a dashboard to know a sale just landed. Delivered to every admin account, deduplicated so retries/repeat callbacks never double-notify, and toggleable under Account → Notifications → Site operations.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-06-14",
  },
  {
    id: "site-admin-coach-ai-feedback-clusters",
    name: "Site admin · AI Feedback sub-tabs (Inbox / Clusters / Trends / KB History)",
    description:
      "The Site admin → AI Feedback page is now organized into four sub-tabs. Inbox keeps the existing raw signal queue (KB misses, refusals, thumbs up/down). Clusters surfaces an LLM-drafted KB review queue: a nightly job (plus on-demand \"Refresh clusters\") groups recent failure signals by topic and proposes a candidate KB chunk per cluster, which the admin can edit, approve (publishes to global KB), or reject. Trends shows daily signal counts and top miss topics for a 7/30/90-day window. KB History lists every recent rag_documents revision with one-click revert to a prior snapshot. Closes the loop from \"coach asks something Cal can't answer\" to \"approved KB chunk\" without manual triage.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-02",
  },
  {
    id: "site-admin-coach-cal-version-toggle",
    name: "Site admin · Coach Cal version toggle (v1 / v2)",
    description:
      "Site Admin → Site settings now has a one-click toggle between Cal v2 (default — full Phase 2 stack: provenance gate rejects hand-authored fences, rescue substitutes tool output on retry failure, server-side label aliasing in compose_play / compose_defense / place_defense) and Cal v1 (legacy pre-Phase-2 behavior: none of the above). Persisted in `site_settings.coach_cal_version` and read once per chat turn by the agent — flips take effect immediately, no deploy required. The emergency `COACH_CAL_PROVENANCE_GATE=off` env var still wins if the UI toggle is unreachable. Catalog fixes (Snag-in-5v5 roster, QB-carry route_kind, Seam lateral drift, etc.) apply in both versions because they're bug fixes, not behavior changes.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-25",
  },
  {
    id: "site-admin-coach-cal-debug-access",
    name: "Site admin · Coach Cal debug-access grants",
    description:
      "Site admins can grant an individual account the same Coach Cal debugging tools admins get — downloading the full chat thread (transcript + lossless JSON) and copying the raw JSON of any Cal response — without making that account a site admin. Managed from Site Admin → People → Cal debug access, which lists every account with debug tools enabled, who granted it, and when. The account still needs its own Coach Cal entitlement to open Cal at all; the grant only unlocks the debug affordances once they're there.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-07-01",
  },
  {
    id: "play-move-to-group-from-action-menu",
    name: "Move a play between groups from the ⋮ menu",
    description:
      "Both the play card menu in the playbook list and the ⋮ menu in the play editor now have a \"Move to group…\" item. Clicking it opens a small picker dialog listing every group in the playbook with the play's current group highlighted, plus an \"Ungrouped\" option to remove it. Same dialog on both surfaces, so coaches learn the affordance once.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "play-edit-overflow-action-menu",
    name: "Unified per-play action menu on the play editor",
    description:
      "The play editor's top action bar is now a two-tier command bar: Copy and New play stay visible on desktop, while Notify team, View history, Archive/Restore, and Delete fold into a ⋮ overflow menu — the same menu component coaches see on each play card. On mobile the bar collapses further to just New play + ⋮ so it always fits one row. Adds Archive and Delete from the editor (previously only available from the play card list), with a confirm prompt on Delete.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "archived-play-read-only-editor",
    name: "Archived plays open read-only with one-click restore",
    description:
      "Opening an archived play in the editor now surfaces a persistent amber banner (\"This play is archived\") and locks every edit affordance — canvas drawing, route toolbar, field-size controls, notes, tags, inspector, rename, formation picker, and play-number reorder. Coaches restore the play in one click via the banner's Restore button or the ⋮ menu, after which editing immediately becomes available without a page reload. Copy and New play stay reachable so the archived play can still seed a new one. Mirrors the existing archived-playbook treatment but scoped to a single play, replacing the previous behavior where archived plays were silently editable with no visual cue.",
    category: "Plays & formations",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-free-trial-prompts",
    name: "Free Coach Cal trial prompts",
    description:
      "New (and existing) free coaches get a handful of real Coach Cal prompts before subscribing — they can actually build a play, generate notes, or ask a matchup question and see Cal work, instead of only ever seeing an upgrade wall. The allowance is a lifetime count per account (site-admin configurable, default 5); only successful turns count, so a Cal error never burns a prompt. Once the free prompts are used up, Cal invites them to Team Coach.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-07-01",
  },
  {
    id: "coach-cal-matchup-grade",
    name: "Ask Coach Cal if a play beats a defense",
    description:
      "Ask Coach Cal \"is this play any good against Cover 3?\", \"how does my mesh hold up against Tampa 2?\", or \"what beats this defense?\" and Cal grades the matchup — a clear verdict (good / contested / tough), exactly where that coverage is soft so you know where to attack, how the defense is built to take your concept away, and concrete alternative concepts that beat it. Right after Cal overlays a defense onto one of your plays, it offers the same read so you can see where the play wins and loses. The analysis is grounded in Playgrid's coverage and matchup knowledge, not guessed.",
    category: "Coach AI",
    status: "beta",
    addedDate: "2026-06-28",
  },
  {
    id: "coach-cal-flip-play",
    name: "Flip a play with Coach Cal",
    description:
      "Ask Coach Cal to \"flip\" or \"mirror\" a play and it now does it correctly. Because \"flip\" can mean a few different things, Cal first asks which you want: mirror the whole play to the other side (everyone moves and routes mirror), flip just the routes while everyone stays put, or flip the formation (Trips Right → Trips Left) while everyone keeps their same route. The mirror is computed exactly by reflecting across the field, so spacing and routes stay clean, and Cal offers to either overwrite the play or save the mirrored version as a new one.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-06-26",
  },
  {
    id: "coach-cal-in-app-cta-schedule-season",
    name: "Schedule the season with Coach Cal — from the Calendar tab",
    description:
      "The Calendar tab now has a \"Schedule the season with Coach Cal\" CTA next to the Subscribe button (coach-only). One click opens Cal with a pre-written prompt that asks Cal to interview the coach about practice cadence (which days, what time, how long), the game schedule (opponents, dates, locations, kickoff times), and any holidays/blackouts. Cal then proposes a season-long calendar and adds the events via create_event once the coach confirms — saving the manual back-and-forth of typing 20+ events one at a time.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-launcher-direct-open",
    name: "Coach Cal opens straight into the chat panel",
    description:
      "The header sparkle icon now opens Coach Cal in the chat panel for everyone — entitled and non-entitled users alike — instead of showing a small marketing popover for non-subscribers. Non-subscribers land on a welcome surface inside the chat with the same path-aware lead, animated examples, and a more prominent \"Start 7-day free trial\" CTA (bold blue/purple gradient instead of the washed-out pastel that read as disabled). On wide viewports the panel now defaults to the right-side dock so it doesn't obscure the page the coach is working on, and the user's chosen panel mode (float vs. dock) persists across close/open. The bottom-left \"Meet Coach Cal\" toast hides itself while the chat is open so coaches don't see two redundant nudges at once.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-in-app-cta-practice-plan",
    name: "Generate a practice plan with Coach Cal — from the Practice Plans tab",
    description:
      "The Practice Plans tab now has a \"Generate a practice plan with Coach Cal\" CTA next to the manual \"New plan\" button (and a prominent version on the empty-state). One click opens Cal with a pre-written prompt that asks Cal to interview the coach about practice length, age tier, plays to install, and focus areas — then propose a structured timeline (warm-up / individual / team install / conditioning) and save it via create_practice_plan once confirmed. Coaches don't have to remember the right structure or block lengths; Cal proposes a sensible timeline grounded in age-tier guidance from the practice KB.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-in-app-cta-starter-playbook",
    name: "Generate a starter playbook with Coach Cal",
    description:
      "On a brand-new playbook (zero plays), the first-play hero now offers \"Generate a starter playbook with Coach Cal\" alongside the manual \"Draw your first play\" CTA. Cal interviews the coach about team age, skill, and league rules, then proposes and adds a starter set of plays one at a time — narrating each call and waiting for confirmation before the next. Replaces the earlier single-play CTA on the same surface (which is still available via the formation picker for adding plays one at a time on established playbooks). Non-Coach-Pro users get the same tailored upsell preview.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-in-app-cta-suggest-counter",
    name: "Suggest a counter with Coach Cal — from any play",
    description:
      "Every play card now has a \"Suggest a counter (Cal)\" item in its action menu, and the play editor has a prominent CTA next to the opponent overlay. One click opens Cal with a prompt that asks Cal to design a counter to that specific play — describe how the opposing scheme would line up and react, then offer to apply it on the field. For an offensive play Cal overlays the counter defense onto the play (changing player positions visibly via the custom-opponent path); for a defensive play Cal proposes a counter offense and adds it to the playbook. Non-Coach-Pro users get the same tailored upsell preview.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-in-app-cta-generate-play",
    name: "Generate plays with Coach Cal — entry points on every new-play surface",
    description:
      "The first-play hero (shown on a brand-new playbook) and the formation-picker modal (shown when starting a new play) both have a \"Generate plays with Coach Cal\" CTA next to the existing manual-create paths. One click opens Cal with a pre-written prompt that asks Cal to interview the coach about team skill and experience, then design a play that fits — formation, routes, QB reads, and notes — and add it to the playbook in one step. Coaches no longer have to know in advance what formation they want; Cal can recommend one. Non-Coach-Pro users get the same tailored upsell preview as the notes-regenerate CTA.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-in-app-cta-notes",
    name: "Generate notes with Coach Cal — one-click button on the play editor",
    description:
      "The play notes card now has a \"Generate notes with Coach Cal\" button next to Show/Hide. One click opens Coach Cal docked next to the play editor with a pre-written, auto-submitted prompt asking Cal to generate notes for that specific play — including when to call the play and the QB's reads/decisions. Cal asks any clarifying questions, proposes the notes, and writes them to the play (the editor refreshes in place). Non-Coach-Pro users see a tailored upsell preview chat showing what Cal would have done, with a 7-day free trial CTA — the input stays disabled so the only path forward is starting the trial. Implemented as a reusable foundation (openCoachCal helper + CoachCalCTA component + entry-point registry) so future entry points (generate plays, suggest counters, build practice plans) drop in with one config entry plus a button placement.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-archive-play",
    name: "Coach Cal can archive plays",
    description:
      "An archive_play tool lets Cal hide plays from the active playbook in bulk. Coaches can say \"archive Snag, Dagger, and the legacy Bender play\" or \"archive these 8\" and Cal moves them out of rotation in one tool call — useful for retiring legacy plays before a rebuild, sidelining concepts that didn't work in scrimmage, or thinning a playbook before a tournament. Soft-delete by design: archived plays preserve their data and can be restored from the playbook UI. Edit-access gated and blocked while a game session is active so coaches can't accidentally archive a play mid-game.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-color-control",
    name: "Coach Cal token color control + no-clash gate",
    description:
      "Coach Cal can now recolor any player's token on an existing play via revise_play / modify_play_route with a set_player_color mod (palette: red, orange, yellow, green, blue, purple, black, white, gray). Identity-preserving — works on offense or defense, with or without a route, and never touches the player's position. Combined with a chat-time validator gate that rejects any play where two skill-position players would render in the same color, Cal is steered toward the full role-keyed palette and pushes back when a recolor request would create a new clash.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-role-keyed-default-colors",
    name: "Role-keyed default token colors for high contrast",
    description:
      "Default offensive token colors are now role-keyed for maximum on-field contrast: QB white, C black, linemen gray, RB (B / HB / single back) purple, FB orange, TE green, X red, Z blue, Y green, slot family (S / A / H / F-as-WR) yellow. The 7v7 default formation now produces seven distinct hues out of the box (no more red + orange + orange clashes). HB + FB on the same play render distinctly (purple + orange) so I-form / 21-personnel reads cleanly. The chat-time no-shared-color gate stays in lockstep — two slots in one play (yellow + yellow) is still flagged so Cal recolors one with set_player_color. Coaches can override per play; the convention is the floor, not the ceiling.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-update-player",
    name: "Coach Cal can rename and reshape players directly",
    description:
      "A dedicated update_player tool lets Cal surgically change one player's label, marker shape, or color on a saved play — without rebuilding the diagram. Coaches can say \"rename B to RB on every play in Recommended\" or \"make the QB a square\" and Cal applies the change in one tool call per play. Identity-preserving by construction (player id, position, and role are guaranteed unchanged), routes owned by the player keep their shape and re-stroke when the color changes, and any @OldLabel mentions in the play notes auto-rewrite to @NewLabel. Complements the broader set_player_color route mod by also handling label, label color, and shape edits.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-rename-duplicate-players",
    name: "Coach Cal can fix duplicate-labeled players across plays",
    description:
      "When a play accidentally has two players sharing the same label (e.g. two Z's after a copy-paste or a formation swap that reused a token), Cal can now disambiguate and rename either one. Cal sees them in get_play exactly the way the renderer presents them — the first as Z, the second as Z2, the third as Z3 — and update_player accepts those same suffixed ids as the player selector. Combined with a new label-audit workflow in Cal's prompt, coaches can hand Cal a label↔color convention (\"Y=green, F=purple, S=yellow, X=red, Z=blue\") and ask Cal to scrub the playbook: Cal walks each play, compares each token's color to the convention, proposes a per-play rename diff, and on confirmation issues one update_player call per fix. No more pushing the analysis back on the coach with \"tell me which player is wrong on which play.\"",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-variant-rule-gates",
    name: "Coach Cal respects per-playbook game rules (blocking, eligible center)",
    description:
      "Cal now reads each playbook's game-rule settings — blocking allowed, center eligible, handoffs allowed, rushing allowed, max players — and treats them as hard constraints. The system prompt header lists the rules so Cal won't propose illegal actions, and the chat-time validator rejects any prose that calls a player a \"lead blocker\" / \"pass protector\" / \"crack-back block\" when blocking is off, any route assigned to @C when the center isn't eligible, and any lineman label (LT/LG/RG/RT) in a flag variant. Defaults: 7v7 (no blocking, ineligible center), 5v5 (no blocking, eligible center), tackle 11 (blocking, ineligible center) — all overridable per-playbook from Site Admin → playbook settings.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-anchored-edit-auto-commit",
    name: "Coach Cal anchored-play edits commit reliably to the database",
    description:
      "When chat is opened from inside the play editor and Coach Cal makes an offense-side edit (revise_play, compose_play, modify_play_route), the agent now auto-commits the rendered fence to the anchored play if Cal didn't follow up with an explicit update_play call. Closes the silent-mismatch case where chat said \"✅ Play Updated\" but the database still held the old version, leaving the editor diagram stale. Defense overlays (compose_defense, set_defender_assignment) and create_play remain on their existing paths so the auto-commit never writes the wrong row. The play editor also now listens for Cal's mutation broadcast as a second refresh hook, so the diagram never lags behind chat even when the route tree's primary refresh hits an edge case.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-marketing-marquee-rewrite",
    name: "Coach Cal landing page + home teaser rewrite",
    description:
      "The /coach-cal landing page and the home-page Coach Cal teaser now showcase Cal's full capability surface. Hero subhead leads with both directions of game-planning (offense and defense), post-game review, season scheduling, and QB-read generation — instead of the prior generate/audit/practice-plans triad. The capabilities grid expanded from 6 to 9 cards (Generate plays, Build a playbook, Beat any defense, Defend any offense, Post-game review, Season scheduling, Playbook review for level, Situational call sheets, QB reads & coaching notes). Pricing tier card now lists 8 specific bullets instead of 5 generic ones. Hero demo chat (and the home teaser's matching chat) swapped to a 4-bubble post-game-review scenario that traverses 3 capabilities (review → playbook adjustment → practice scheduling) — replacing the previous compose-play → compose-practice example that only showed one species of work. SEO description, keywords, and JSON-LD featureList updated to surface the previously-missing capabilities for ranking on \"AI defensive coordinator,\" \"AI game review football,\" \"AI football schedule generator,\" and similar high-intent queries.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-out-of-beta",
    name: "Coach Cal generally available (no beta gate)",
    description:
      "Coach Cal is no longer behind a Site Admin → Beta features toggle. Any user with a Coach Pro subscription (or a site admin) gets Cal automatically — same gate as every other Coach Pro feature. Removes the dual-control surface where the beta scope could be flipped \"off\" while subscriptions were already paying for it. The Site Admin row is gone; the entitlement check (tier === \"coach_ai\" or admin) is the single source of truth at every callsite (chat action, streaming endpoint, header launcher, in-playbook launcher, play-editor CTA).",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-marquee-starter-prompts",
    name: "Coach Cal marquee starter prompts (context-aware)",
    description:
      "The empty-state suggestion chips in the Coach Cal chat now showcase Cal's full capability surface — generate playbooks, defensive game-planning, post-game review, season-wide scheduling, situational call sheets (red zone, 3rd-and-short, opening drive), playbook skill-level review, and QB-read note updates — instead of the three rules/red-zone/Cover-3 examples the chat shipped with. Five chips are sampled randomly per chat-open, weighted toward the user's current view (a coach inside a play sees mostly play-specific suggestions; in the calendar, scheduling/post-game lead). Refreshes when the user navigates so the suggestions stay relevant without the coach manually rerolling.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-organize-plays-into-groups",
    name: "Coach Cal can organize plays into situational groups",
    description:
      "Cal can now create, rename, and delete play groups and bulk-move plays between them — \"3rd & Long\", \"Goal Line\", \"Red Zone\", \"Extra Point\", and so on. Coaches can ask \"organize my plays for me\" and Cal will read the playbook, propose a grouping, and on approval create the folders and bucket every play in one batch. Cal sees each play's current group in list_plays output too, so it never makes duplicate buckets or strands plays.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-clickable-play-references",
    name: "Coach Cal clickable play and playbook references",
    description:
      "When Cal mentions a saved play or playbook in a reply (\"Play 5\", \"Smash\", \"Spring 2026 Playbook\"), the name now renders as an inline pill the coach can click to pop that play or playbook into the main content area — without leaving the chat. Cal emits the references as `play://<id>` / `playbook://<id>` markdown links so the linkage is anchored to the actual record, not pattern-matched on text.",
    category: "Coach AI",
    status: "beta",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-defenders-react-to-play",
    name: "Coach Cal: defenders react to the offensive play",
    description:
      "When Coach Cal overlays a defense on a known offensive concept (Flood, Mesh, Slant-Flat, Smash, Four Verticals, Curl-Flat), the key defenders now have ROUTES showing how they react — the hook defender drives on @X's slant, the Mike carries the seam vertical, the deep-third corner overlaps the outside go. Only the defenders whose movement is the teaching point get explicit paths; everyone else stays in their catalog zone, so the diagram stays readable. Seeded for Tampa 2, Cover 3, Cover 2, Cover 1, and Cover 0 in 7v7 (with Cover 3 and Cover 1 also seeded for tackle 11) — Cover 2 vs Flood, for example, has the safety carry the vertical to the deep half, the hook/curl defender undercut the sail, and the corner cap the flat. Cal includes the per-defender coaching cue (\"@HL sits the hook 5 yds, drives downhill on the slant break\") in the defense prose so coaches can teach the read, not just the alignment.",
    category: "Coach AI",
    status: "beta",
    addedDate: "2026-05-20",
  },
  {
    id: "coach-cal-save-defense-as-new-play",
    name: "Coach Cal: keep a defense overlay — your choice",
    description:
      "After Coach Cal overlays a defense on one of your offensive plays, it shows the look in chat and offers a two-button chip so YOU decide what to keep — Cal no longer saves silently behind your back. \"Add to this play\" attaches the defenders as that play's opponent overlay (they show whenever you open the offense, and your saved standalone coverages stay untouched). \"Save as new defense play\" creates a separate defense play linked to the source offense — name defaults to \"{Defense} vs {OffensePlay}\" (e.g., \"Cover 2 vs Flood Right\"), the offense is stored as a vs_play_snapshot so it always renders against the right look, and a wristband code is auto-assigned. Nothing is written until you click. Both options stay callable by the whole staff.",
    category: "Coach AI",
    status: "beta",
    addedDate: "2026-05-29",
  },
  {
    id: "coach-cal-anchor-aware-play-resolution",
    name: "Coach Cal: anchor-aware play resolution",
    description:
      "When you have a play open in the editor and reference it numerically (e.g. \"play 14\"), Coach Cal now defaults to the anchored play and confirms before acting — closing a class of bugs where Cal looked up a different play under the hood (the orange UI badge is a global position; Cal's resolver was using per-group slots, and the two interpretations could disagree). Explicit references (UUID, group-qualified slot, exact name) still resolve directly; only bare numerics route through the confirmation step.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-20",
  },
  {
    id: "coach-cal-compose-revise-architecture",
    name: "Coach Cal compose/revise architecture + defensive renderer",
    description:
      "Coach Cal's play-composition pipeline rebuilt from validators-as-gatekeepers to constructive-tools-as-source-of-truth. New tools — compose_play, revise_play, compose_defense — produce coach-canonical fences from intent (concept name + optional overrides for compose; player + intent-level mods for revise). Cal cannot freelance route geometry because Cal never authors waypoints. Every fence passes through a defensive sanitizer (drops oversize zones, NaN coords, out-of-bounds players) before display, so corrupt schema can never paint the whole field or stack players on top of each other. Identity-preservation is enforced inside revise_play (players[] is byte-equal across batched mods), making the \"Why did you flip it?\" regression structurally impossible. compose_defense has a parallel byte-preserve gate on the offense when overlaying (Rule 11), so adding a defense to a play can never silently swap the offense.",
    category: "Coach AI",
    status: "beta",
    addedDate: "2026-05-02",
  },
  {
    id: "coach-cal-side-aware-notes",
    name: "Coach Cal side-aware play notes",
    description:
      "When Cal saves notes onto a play, the prose now matches the play's side. Defense plays get defender-perspective notes (when to call it, the primary key, per-defender assignments — zone drops with the void to protect, man matches with leverage, blitz lanes, pattern-match rules) instead of the old offense-attack vocabulary that leaked through (\"@Q reads…\", \"the throw\", \"exploits Tampa 2\"). The deterministic spec→notes projection now produces a defender-led layout for defense plays, and a server-side lint rejects offense-perspective vocabulary on a defense play (and vice versa) before notes are saved — same structural-gate approach already used for route-family contradictions.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "coach-cal-defense-composition",
    name: "Coach Cal defense composition framework",
    description:
      "Defensive plays now compose from per-defender assignments — every defender in the catalog is explicitly tagged as zone (drops into a named zone), man (matched on a receiver), blitz (rushes a gap), or spy (shadows a player). The old coverage-wide \"man or zone\" boolean is gone, so Cal correctly draws Cover 1 as man-with-FS-deep-middle (not all-man-no-zones) and shows assignment lines, blitz arrows, and zone shapes in the same diagram. Same structural-by-construction approach Cal already uses for offensive plays.",
    category: "Coach AI",
    status: "beta",
    addedDate: "2026-05-02",
  },
  {
    id: "coach-cal-inline-playbook-note-chips",
    name: "Coach Cal inline \"Save to playbook notes\" chips",
    description:
      "Coach Cal can now propose saving team-specific knowledge (schemes, terminology, opponent notes, personnel observations) to the current playbook's knowledge base directly inside the chat — no separate \"playbook training\" mode to toggle. When the coach says something save-worthy, Cal surfaces a sky-blue chip with a Save / Dismiss action right under its reply. The previous explicit mode toggle, sky header chrome, and \"Playbook\" badge have been removed; the chip itself is the affordance.",
    category: "Coach AI",
    status: "beta",
    addedDate: "2026-04-30",
  },
  {
    id: "playbook-duplicate-copy-coach-cal-notes",
    name: "Optionally copy Coach Cal notes when duplicating a playbook",
    description:
      "The Duplicate dialog (both on the home dashboard and inside a playbook) now offers an \"Also copy Coach Cal notes\" checkbox when the source playbook has any. Brings team-specific schemes, terminology, and opponent notes along with the duplicate so a copy doesn't start with an empty knowledge base. Off by default — coaches must explicitly opt in, the same pattern used for game results.",
    category: "Playbook",
    status: "ga",
    addedDate: "2026-04-30",
  },
  {
    id: "coach-cal-mobile-playbook-launcher-fix",
    name: "Coach Cal launcher consistent on mobile inside a playbook",
    description:
      "Inside a playbook on mobile (where the global header collapses), the AI button used to be a plain chat-bubble icon that opened the chat directly — bypassing the entitlement gate, so non-Coach-Pro users hit the consent disclaimer before they even saw the marketing pitch. Replaced with the same CoachAiLauncher used everywhere else, so mobile-in-playbook now matches landing-page UX: gradient/sparkle icon, marketing popover for non-entitled users, chat for entitled users.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-cal-launcher-polish",
    name: "Coach Cal launcher polish",
    description:
      "The Coach Cal launcher button now reads as AI at a glance: gradient-filled icon container with a small ✨ sparkle badge in the corner instead of the bare chat-bubble that looked like a generic message icon — especially noticeable on mobile.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-cal-promo-contextual-demo",
    name: "Coach Cal promo demo (context-aware)",
    description:
      "When a non-entitled user clicks the Coach Cal launcher, the marketing popover now leads with a path-aware sentence (\"Coach Cal can draw this play…\" on the play editor; \"…build out this playbook\" on a playbook; etc.) and shows an animated mini chat that cycles through real prompt/response examples — drawing plays, beating defenses, planning practices, scheduling games, adjusting for skill level. Replaces the previous static capability bullet list.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-cal-feedback-rename",
    name: "Coach Cal feedback prompt rename",
    description:
      "The first-use feedback opt-in modal and the Account-page setting now refer to the assistant as \"Coach Cal\" (its product name) instead of the technical \"Coach AI.\" The modal still only fires inside the chat window — a surface that's only reachable by entitled users — so non-entitled marketing visitors never see it.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-cal-cta-play-editor",
    name: "Coach Cal teaser inside the play editor",
    description:
      "The Coach Cal CTA banner — previously only on the playbook list — also fires on the individual play editor for non-Coach-Pro users. Coaches deep in the editing workflow now discover Coach Cal at the moment they could most use AI suggestions, not just on the playbook overview.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-cal-launcher-entitled-gradient",
    name: "Coach Cal launcher uses brand gradient for subscribers too",
    description:
      "The header Coach Cal button for Coach-Pro subscribers used to render a faint primary-tinted sparkle on a primary/10 tile — barely visible in dark mode and indistinguishable from any other action button. It now uses the same brand-gradient icon (blue → indigo → orange with the white 4-point sparkle and green accent dot) that non-subscribers see, so Coach Cal stays visually distinct as the AI surface in every theme.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "coach-cal-promo-repulse",
    name: "Coach Cal promo re-pulses after 14 days idle",
    description:
      "The non-subscriber Coach Cal launcher pulses with a halo + ✨ corner badge until first click, then settles. Previously it stayed settled forever — coaches who tapped once and never came back to that path lost the affordance. The pulse now re-arms 14 days after the last dismissal so Coach Cal stays discoverable without nagging.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "play-cap-soft-warn",
    name: "Play-cap soft warning",
    description:
      "Free owners see a banner inside the Plays tab as they approach the per-playbook play cap (within 3 of the limit) and a stronger lock-flavored banner at the cap, both linking to /pricing?upgrade=play-cap. Replaces the previous silent failure when adding a 17th play.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-cal-undo",
    name: "Coach Cal undo",
    description:
      "Coach Cal can now undo any edit it just made to a play. Asking it to \"undo\", \"revert\", or \"go back\" makes Cal pull the play's recent history, confirm the target version with the coach, and restore. The restore creates a new audit row instead of erasing history, so the coach can always step forward again.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-04",
  },
  {
    id: "print-redesign-format-presets",
    name: "Print page format picker + system presets",
    description:
      "The print playbook page replaces tabbed low-level controls with a stepped flow: pick plays, pick a format (Call sheet, Playbook, or Wrist coach), apply a preset, and only open Customize for advanced options. New Playbook format prints 1 or 2 plays per page. Site admins can promote any saved preset into a system preset (with a thumbnail captured from the live preview and a tooltip description) so every coach starts from a curated baseline.",
    category: "Print & export",
    status: "ga",
    addedDate: "2026-05-04",
  },
  {
    id: "wristbands-locked-segment",
    name: "Wristbands lock affordance",
    description:
      "Free users browsing the playbook print tool see the Wristband output-type segment with a lock icon and \"(Team Coach)\" label, making the gated feature visible without trial-and-error. Pairs with the existing locked-preview screen they hit on click.",
    category: "Print & export",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "collaborator-build-your-own-banner",
    name: "Collaborator → owner nudge",
    description:
      "Coaches who collaborate on others' playbooks but haven't built their own see a banner on /home and inside each shared playbook inviting them to start a free playbook of their own (deep-links to /home?create=1). Frames creation positively — collaborating and owning are independent on the free tier. The in-playbook banner is dismissible per-playbook.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "playbook-send-copy",
    name: "Send a copy",
    description:
      "Coaches generate a copy link that gives the recipient their own standalone, editable copy of the playbook on claim. Distinct from collaboration invites — recipients become the owner of their copy and don't see the sender's future edits. Built for viral onboarding: peer coaches and prospects can claim a starter playbook and try the product before they pay.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-04-28",
  },

  // ── Coach AI ───────────────────────────────────────────────────
  {
    id: "coach-ai-chat",
    name: "Coach Cal chat",
    description:
      "A football-aware AI coaching partner available across the app — rules lookup, scheme explanations, strategy Q&A, and play diagrams generated on demand.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-01",
  },
  {
    id: "coach-ai-anchored",
    name: "Playbook-anchored chat",
    description:
      "When opened inside a playbook, Cal stays anchored to that team across navigation — including into the play editor — so its play and calendar tools stay live without re-prompting.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-ai-rag",
    name: "Knowledge-base grounding",
    description:
      "Cal answers from a curated rules and schemes knowledge base (5v5/7v7/tackle, NFHS/Pop Warner/AYF/NFL Flag) with embedded retrieval.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-10",
  },
  {
    id: "coach-ai-play-tools",
    name: "Play and playbook editing via chat",
    description:
      "Cal can list, retrieve, create, rename, edit, and update notes on plays — every write requires explicit coach confirmation.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-ai-calendar-tools",
    name: "Calendar management via chat",
    description:
      "Cal can read, schedule, reschedule, cancel, and RSVP to events on the playbook calendar — including bulk RSVP across all upcoming events.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-ai-defense-diagrams",
    name: "Canonical defensive diagrams",
    description:
      "Cal draws defensive coverages from a vetted alignment catalog with role-coded defenders (CB / safety / hook / flat / LB / nickel) and zone shapes for zone coverages.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-ai-scheme-synthesizer",
    name: "Any-scheme synthesizer (offense + defense)",
    description:
      "When a coach asks for a scheme that isn't in the canonical catalog (e.g. 6-2 defense, 5-2 Eagle, Wishbone, Twins Right), Cal still draws it correctly. The synthesizer parses the front or formation name, places the right number of players at the right depths, and generates zones based on the coverage shell. The coach gets a structurally-valid diagram instead of \"no alignment for that combo.\"",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-30",
  },
  {
    id: "coach-ai-defender-movement",
    name: "Defender reaction routes",
    description:
      "On matchup diagrams Cal authors defender movement — short re-positions in zone, full mirror routes in man — with optional per-route playback delays so defenders react to the snap or to a receiver crossing a yard marker.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-ai-diagram-validator",
    name: "Server-side diagram validator",
    description:
      "Every Cal-generated full-defense diagram is validated server-side against the alignment catalog before reaching the coach. Bad diagrams are silently re-rolled once with a corrective critique.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-28",
  },
  {
    id: "coach-ai-training-modes",
    name: "Admin and playbook training modes",
    description:
      "Admins can edit the global knowledge base in chat; coaches can curate playbook-specific notes. Both modes confirm every write.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-15",
  },
  {
    id: "coach-ai-practice-plans",
    name: "Cal builds and saves practice plans",
    description:
      "Coaches can ask Cal to build a practice plan and save it directly to the Practice Plans tab — title, age tier, notes, and ordered time blocks (with optional 1-3 parallel station lanes). Cal confirms the timeline before writing, and the new plan opens in the structured timeline editor.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "coach-ai-context-switcher",
    name: "Cal context switcher",
    description:
      "The \"Anchored to …\" header in the Coach Cal window is now clickable, opening a dropdown of the coach's playbooks. Picking one navigates to that playbook and re-anchors Cal to it in a single click — no need to leave the chat to change context.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-02",
  },
  {
    id: "coach-ai-show-more-details",
    name: "Inline \"Show more\" on long Cal replies",
    description:
      "Long answers used to bury everything under a binary \"Show details\" disclosure. Now Cal shows a peek of the deeper breakdown right under the TL;DR with a soft fade and a subtle \"Show more\" link — coaches can scan the depth without committing to a full reveal.",
    category: "Coach AI",
    status: "ga",
    addedDate: "2026-05-02",
  },

  // ── Game mode ──────────────────────────────────────────────────
  {
    id: "game-mode",
    name: "Game mode",
    description:
      "Locked, presentation-friendly view of a playbook for live game-day use. Recent plays, quick search, large diagrams.",
    category: "Game mode",
    status: "ga",
    addedDate: "2026-02-15",
  },

  // ── Print & export ─────────────────────────────────────────────
  {
    id: "print-hide-opponents-default",
    name: "Hide opponents on print by default",
    description:
      "Printed playsheets and wristbands now show only the coach's own players by default — the frozen opposing-side snapshot used in the editor canvas is omitted unless the coach turns on \"Show opponents if available\" under the Layout tab. Keeps call sheets focused on what the coach's players need to see.",
    category: "Print & export",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "print-number-chip-on-header-line",
    name: "Play number chip on the header line",
    description:
      "Setting the play-number chip to \"Top left\" or \"Top right\" now rests it on the same line as the formation/name labels instead of dropping it onto the field. With Number, Formation, and Name all toggled on the top row, a play card reads cleanly as \"01  Pro Right · Vertigo\" — no more wasted vertical space and no chip overlapping the diagram. Added a new \"Top right\" position to mirror \"Top left\" for coaches who prefer the chip on the right edge.",
    category: "Print & export",
    status: "ga",
    addedDate: "2026-05-05",
  },
  {
    id: "print-playsheet-notes-compact",
    name: "Compact note text on call sheets",
    description:
      "New \"Compact text\" toggle in the print tool's Text section flattens line breaks in the play notes into a single packed paragraph so coaches can fit a full game-plan blurb (primary read, secondary, tertiary, outlet, vs Cover 2 notes) into a tight call-sheet cell. Bullet markers (`-` / `*`) at the start of a line are preserved as visible `•` separators, so the structure still reads even when there's no vertical break.",
    category: "Print & export",
    status: "ga",
    addedDate: "2026-05-05",
  },
  {
    id: "print-playsheet-notes-controls",
    name: "Roomy play notes on call sheets",
    description:
      "The Text tab on the playbook print tool now owns every notes-related control: show/hide, a slider that grows the notes area up to ~30 lines (as much as the page can hold), a font-size slider, and a \"Use visual player references\" toggle that swaps single-letter mentions like X, H, or Z for the same colored circle + letter the diagram uses. Coaches can pack a full game-plan blurb under each play instead of being capped at three lines.",
    category: "Print & export",
    status: "ga",
    addedDate: "2026-05-03",
  },
  {
    id: "print-pdf",
    name: "Print plays to PDF",
    description:
      "Render a playbook (or a subset) to a print-ready PDF with configurable layout — wristband strips, full-page diagrams, formation packs.",
    category: "Print & export",
    status: "ga",
    addedDate: "2025-08-01",
  },

  // ── Billing & accounts ─────────────────────────────────────────
  {
    id: "billing-tiers",
    name: "Free + Coach AI tiers",
    description:
      "Free tier with capped plays per playbook. Paid Coach AI tier unlocks unlimited plays plus the Cal chat surface.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-03-01",
  },
  {
    id: "coach-seats",
    name: "Coach seat invitations",
    description:
      "Coaches with paid plans can invite assistant coaches who inherit playbook access without paying.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-03-15",
  },
  {
    id: "gift-codes",
    name: "Gift codes",
    description:
      "Admin-issued promo codes that grant a paid tier for a fixed duration.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-03-15",
  },

  // ── Admin tools ────────────────────────────────────────────────
  {
    id: "admin-revenue-breakdown",
    name: "Revenue breakdown tab",
    description:
      "Site Admin → Revenue shows MRR / ARR / paid users / lifetime revenue at the top, then a tier breakdown (Coach vs Coach Pro by sub count and MRR contribution), a stacked monthly chart of recurring vs one-time revenue over the last 12 months, and a top-20 customers table sorted by lifetime spend with email + tier. Data pulls live from Stripe, cached for 60 minutes. The Overview tab's Paid users / MRR / Total revenue tiles now jump here instead of Stripe config.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-22",
  },
  {
    id: "admin-overview-dashboard",
    name: "Site admin Overview dashboard",
    description:
      "Site Admin → Overview shows top-line health on a single page: total users, paid users, MRR, active users, lifetime revenue (hero strip), a 6-step activation funnel (signed up → playbook → 1/5/10/13+ plays) with drop-off % between steps, a daily traffic sparkline with views/signups/sessions and prior-period deltas, top 5 referrers, a geography snapshot, and an engagement card showing Coach Cal triers and distinct sharers. A 7d/30d/90d/all-time selector scopes the windowed metrics. MRR + lifetime revenue come live from Stripe with a 60-min cache.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-22",
  },
  {
    id: "admin-attributed-signups",
    name: "Attributed signups per user",
    description:
      "Site Admin → Users adds a sortable \"Brought in\" column counting how many new signups each user attracted via a share link (last-touch attribution across their lifetime). Helps spot the highest-influence users at a glance.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-22",
  },
  {
    id: "admin-sidebar-nav",
    name: "Site admin sidebar navigation",
    description:
      "Site Admin moves from a horizontal segmented control to a grouped sidebar (Insights / Users & growth / Operations / Configuration), with a mobile drawer and persisted active tab via localStorage so admins land back where they left off.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-22",
  },
  {
    id: "admin-geography",
    name: "Geography dashboard",
    description:
      "Site Admin → Geography plots a world map of user activity with one dot per city, sized so the dot's area is proportional to views. Includes per-city and per-country tables (views, sessions, signups) and a 7/30/90/365 day window selector.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-15",
  },
  {
    id: "admin-coach-cal-upgrade-banner",
    name: "Coach Cal upgrade banner toggle",
    description:
      "Site Admin → Site → Coach Cal upgrade banner switches a maintenance notice on/off at the top of the Coach Cal chat window so entitled users know Cal is being actively upgraded and may behave unusually.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-02",
  },
  {
    id: "admin-coach-cal-functional-tests",
    name: "On-demand Coach Cal functional tests",
    description:
      "Site Admin → Functional Testing has a 'Run Coach Cal tests' button that triggers the headless Coach Cal scenarios against production on demand. These spend real LLM tokens, so they're excluded from the automatic post-deploy and nightly runs and only fire when an admin asks; results land in the same tab a few minutes later, badged 'Coach Cal'.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-06-29",
  },
  {
    id: "admin-users",
    name: "User administration",
    description:
      "Search users, edit roles, audit playbook membership, impersonate for support.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2025-09-01",
  },
  {
    id: "admin-analytics-exclusions",
    name: "Analytics email exclusions",
    description:
      "Site Admin → Analytics → Settings lets the owner list emails (own, family, test accounts) to exclude from the Traffic and Monetization Health dashboards so internal activity doesn't skew the numbers.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-01",
  },
  {
    id: "admin-traffic",
    name: "Traffic dashboard",
    description:
      "First-party traffic, signups, and conversion summary. No external trackers.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2025-12-01",
  },
  {
    id: "admin-traffic-coach-cal-panel",
    name: "Coach Cal CTA performance panel",
    description:
      "New per-surface table on Site Admin → Traffic → Engagement showing impressions / clicks / click rate / dismisses / dismiss rate / walk-aways for each Coach Cal CTA (playbook floating card and site-header promo popover). Self-serve answer to 'are people seeing the proposals and showing interest, or just dismissing?'.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-30",
  },
  {
    id: "coach-cal-cta-instrumentation",
    name: "Coach Cal CTA telemetry",
    description:
      "Floating playbook-page card and the header promo popover now emit coach_cal_cta_impression / _click / _dismiss events tagged by surface. Admin Engagement tab can compute interest (click rate) vs rejection (dismiss rate) per surface.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-30",
  },
  {
    id: "auth-email-typo-suggestion",
    name: "Did-you-mean email correction at signup",
    description:
      "The signup form watches the email domain and surfaces a one-tap 'Did you mean foo@gmail.com?' suggestion when it matches a common typo (gmail.con, gnail.com, yaho.com, etc). Catches the most common cause of dead 'Never signed in' accounts before the OTP gets sent into the void.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-04-30",
  },
  {
    id: "auth-purge-unconfirmed",
    name: "Auto-purge stale unconfirmed signups",
    description:
      "Daily admin sweep that hard-deletes auth.users rows that have never been signed into and were created more than 30 days ago — typically typo'd emails and abandoned signups that pollute total-user counts. Runs via /api/auth/purge-unconfirmed with the CRON_SECRET bearer token.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-30",
  },
  {
    id: "admin-users-time-on-site-sort",
    name: "Sortable Time-on-site + Last-sign-in",
    description:
      "Site Admin → Users now has a Time on Site column (cumulative active seconds across all sessions) plus sortable headers on Time on Site and Last sign in. Per-row Edit / Reset password / Delete buttons collapsed into a kebab menu to free space for the new column.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-30",
  },
  {
    id: "first-play-hero-empty-state",
    name: "First-play hero on empty playbooks",
    description:
      "Brand-new playbooks (zero plays, owner viewing) now render a single dominant 'Draw your first play' hero instead of the full play-grid chrome (search, filters, Print, Game, formation tabs, roster tabs). Tabs collapse to just Plays until the first play exists; everything reappears once they have one. Driven by a session replay where a free-tier coach spent 7 minutes wandering between Formations and /pricing without creating a play.",
    category: "Playbook",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "example-claim-as-starting-point",
    name: "Start with an example",
    description:
      "Visitors browsing a published example playbook can claim it as their own starting point — one click clones the example into their workspace as their first owned playbook (free-tier slot rules apply). Beats starting from a blank page when the visitor already saw something they liked.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "example-print-preview-demo",
    name: "Print preview demo on examples",
    description:
      "Unauthenticated visitors browsing an example playbook now see the full Print page (Plays/Layout/Visuals/Text/Presets sidebar with live preview) instead of an empty 'create your own' card. Print and PDF buttons are intercepted with a 'make this yours' modal — visitors get to feel the export experience before being asked to convert.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "claim-and-duplicate-customize",
    name: "Customize on claim or duplicate",
    description:
      "When a coach claims an example or duplicates a playbook, the dialog now pre-fills a smart default name (\"{First}'s {Sport} Playbook\"), source color, and source logo — and lets them tweak any of the three before the copy is created. Beats landing on a copy still named \"Flag 5v5 Example\" or \"Foo (copy)\". Team Coaches viewing an example as a non-owner member also see a \"Make this mine\" CTA in the build-your-own banner so they can claim a copy without going to /home — previously that banner only sent them to a blank create flow.",
    category: "Playbook",
    status: "ga",
    addedDate: "2026-05-01",
  },
  {
    id: "seo-how-to-flag-playbook-guide",
    name: "How-to-build-a-flag-football-playbook guide",
    description:
      "Long-form coaching guide at /learn/how-to-build-a-flag-football-playbook targeting the informational half of the \"make flag football playbook\" Google query (~1,800 words). Walks coaches through install size, formation choice, the four pass concepts to install first, run-game additions, trick play selection, situational organization, defensive call sheets, and printing. Liberal internal links into the Football Library and the /flag-football-playbook product page; Article + FAQPage + BreadcrumbList JSON-LD for rich-result eligibility.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-05-26",
  },
  {
    id: "seo-flag-football-landing",
    name: "Flag football playbook landing page",
    description:
      "Dedicated /flag-football-playbook landing page targeting high-intent search queries (\"make flag football playbook\", \"flag football playbook builder\"). Includes hero CTA, feature grid, 8 featured 5v5 plays linked into the Football Library, deep links into each variant rollup (5v5/6v6/7v7), FAQ with FAQPage schema, and WebApplication JSON-LD. Pairs with the un-gated Football Library to turn search referrals into trials.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-05-26",
  },
  {
    id: "seo-library-variant-rollups",
    name: "Library variant rollup pages",
    description:
      "Indexable collection pages at /learn/library/plays/variant/{flag-5v5,flag-6v6,flag-7v7,tackle-11} — one per variant, each listing every play concept available for that game. Replaces the previous client-side ?v= filter, which produced no distinct URL for Google to index, so head-term queries like \"5v5 flag football plays\" now have a dedicated landing target.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-05-26",
  },
  {
    id: "example-sticky-cta-desktop",
    name: "Sticky desktop CTA on examples",
    description:
      "Always-visible footer bar on desktop while browsing an example playbook — playbook name + 'Make this mine' button + dismiss. Mobile already has a thumb-reachable in-header CTA; the sticky bar closes the desktop visibility gap.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "admin-traffic-engagement-virality",
    name: "Engagement + virality analytics",
    description:
      "Sub-tabs in the admin Traffic dashboard for in-app behavior (activation funnel, exit pages, dwell time, top events) and sharing virality (K-factor, top sharers, inbound conversion). Powered by ui_events, share_events, and page_view dwell beacons — all first-party.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-29",
  },
  {
    id: "admin-feedback",
    name: "User feedback inbox",
    description:
      "Site-wide feedback submissions and Coach Cal thumbs-up/down ratings flow into an admin queue with KB-miss reports.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-01",
  },
  {
    id: "admin-opex",
    name: "Operating-expense tracking",
    description:
      "Track monthly costs per third-party service (OpenAI, Anthropic, Supabase, etc.) with deep links to each provider's billing console.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-20",
  },
  {
    id: "admin-beta-flags",
    name: "Beta feature flags",
    description:
      "Per-feature gating with allowlists so new capabilities can be tested with select coaches before general release.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-03-01",
  },
  {
    id: "admin-rag-embeddings",
    name: "RAG embeddings management",
    description:
      "Backfill / re-embed Coach Cal knowledge-base entries; surface coverage stats and miss reports.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-10",
  },
  // ── Marketing site ──────────────────────────────────────────────
  {
    id: "marketing-join-app-nudge",
    name: "“Get the app for notifications” nudge at join",
    description:
      "When someone accepts a team invite on the web, the success screen nudges them to install the app — because push notifications for games, schedule changes, and team messages are app-only. The prompt is platform-aware: a Download-on-the-App-Store / Get-it-on-Google-Play button on phones, and a scan-to-install QR code on desktop. A shareable /get-app smart link redirects each device to the right store. Auto-approved players now see this confirmation screen instead of being sent straight to the playbook.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-06-22",
  },
  {
    id: "marketing-ios-app-banner",
    name: "iOS app install banner",
    description:
      "iPhone and iPad mobile-web visitors are nudged to install the XO Gridmaker app from the App Store. In Safari this is Apple's native Smart App Banner (which also shows 'Open' when the app is already installed); in other iOS browsers (Chrome, Firefox, in-app webviews) a matching dismissible bar at the top of the page deep-links to the App Store listing. Shown only on iOS (never on desktop, Android, or inside the native app); dismissal sticks across sessions. Impressions, clicks, and dismissals are tracked for conversion measurement.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-06-22",
  },
  {
    id: "marketing-android-app-banner",
    name: "Android app install banner",
    description:
      "Android mobile-web visitors see a dismissible Smart App Banner at the top of the page promoting the XO Gridmaker app on Google Play, with an 'Open' button that deep-links to the Play Store listing. Shown only on Android browsers (never on desktop, iOS, or inside the native app); dismissal sticks across sessions. Impressions, clicks, and dismissals are tracked for conversion measurement.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-05-28",
  },
  {
    id: "marketing-hero-playbook",
    name: "Hero playbook (admin-pickable, with A/B tracking)",
    description:
      "Site admin can flag any published example playbooks to take over the home-page hero shot — the book tile renders in place of the X/O illustration, with a 'Try this playbook' CTA that opens it in the visitor-preview editor. Multiple playbooks can be flagged at once; the home page picks one at random per render and logs an impression. The CTA logs a click event before navigation. Per-playbook impressions and clicks live in marketing_hero_events so winners can be picked from CTR over time. If no playbook is flagged, the home page falls back to the existing logo with no behavior change.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-04-30",
  },
  {
    id: "marketing-consolidated-landing",
    name: "Consolidated landing page",
    description:
      "The home page is the single marketing surface and tells the full story in one scroll: hero with a free-led CTA, the product tour (#tour anchor), Coach Cal teaser, free-for-solo callout, print-to-wristband proof, real example playbooks, and a final CTA. The previous /learn-more deep-dive route is 301-redirected to /#tour. /coach-cal remains as a dedicated AI-pitch page for ad landing and SEO.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-04-29",
  },
  {
    id: "library-conversion-cta",
    name: "Football Library build-your-own CTA",
    description:
      "Every Football Library hub and category-index page ends with a conversion band that turns a read-only reference page into a path into the product. Anonymous visitors (the bulk of organic library traffic) see a 'Start your free playbook' button into the signup flow plus a 'Take the tour' secondary; signed-in coaches see 'Go to your playbooks' instead. Clicks fire a library_cta_click event so library → signup conversion is measurable. Added because ~9% of all sessions now enter cold via the library but were bouncing without ever reaching the builder.",
    category: "Marketing site",
    status: "ga",
    addedDate: "2026-06-09",
  },
  {
    id: "admin-feature-list",
    name: "Feature catalog",
    description:
      "This page. Source-of-truth inventory of shipped capabilities, maintained alongside the codebase.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-28",
  },
  {
    id: "admin-oauth-provider-toggles",
    name: "OAuth sign-in toggles",
    description:
      "Site admins control whether the \"Continue with Google\" and \"Continue with Apple\" buttons appear on the login page. Each provider can be flipped independently so a misconfigured one (missing keys, expired Apple JWT) never surfaces a button that errors.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-01",
  },
  {
    id: "billing-in-place-upgrade",
    name: "In-place plan upgrade with proration preview",
    description:
      "Existing Team Coach subscribers clicking Coach Pro on the pricing page now see a confirmation modal showing exactly what they'll be charged today (unused Team Coach credited against prorated Coach Pro) and the date their renewal flips to the new plan rate. Confirming swaps the price on the existing Stripe subscription in place — no second subscription, no double-billing, no trip through Stripe Checkout. Seat add-ons survive the swap untouched.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-05-20",
  },
  {
    id: "billing-scheduled-downgrade",
    name: "Scheduled plan downgrade at period end",
    description:
      "Coaches can downgrade their plan from /pricing — Coach Pro → Team Coach, Team Coach → Solo Coach, or cancel the paid plan altogether — and the change takes effect at the end of the current billing period instead of immediately. A confirmation modal shows the exact switch date before they commit. The /account page surfaces a pending-change banner with a one-click \"Cancel this change\" button until the switch happens. Seat add-ons carry across paid → paid transitions automatically. Implementation uses Stripe subscription schedules for paid-to-paid (two-phase price transitions) and cancel_at_period_end for paid-to-free.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-05-20",
  },
  {
    id: "playbook-offline-graceful-degrade",
    name: "Offline-ready iOS/Android app",
    description:
      "In the native iOS and Android apps, playbooks downloaded for offline (offense, defense, and special teams) stay fully usable on the sideline without signal — downloaded tiles get a small cloud-down marker, and tapping a downloaded tile opens its plays from the device cache. Cached playbooks refresh themselves in the background whenever the device is online (on app foreground, on reconnect, and on a 30-minute timer) so the offline copy on the sideline matches what was edited in the office. Non-downloaded playbook tiles grey out with a \"Not downloaded — connect to view\" overlay so coaches see at a glance what's available. A floating \"Offline · N playbooks available\" status pill appears whenever the device drops signal. Connection-required features (Coach Cal chat, game mode launcher, download/refresh) grey out with a tooltip so taps don't stall on a dead network.",
    category: "Playbook",
    status: "ga",
    addedDate: "2026-05-19",
  },
  // Coach Cal image input ("Cal reads play sheets / wristcoaches / whiteboards")
  // was pulled 2026-06-11 — the hand-drawn vision pipeline was unreliable and the
  // per-image vision calls were expensive. The capability is off end-to-end
  // (see COACH_CAL_IMAGE_UPLOADS_ENABLED), so it's removed from the catalog
  // rather than listed as GA. Restore this entry if the feature is re-enabled.

  // ── League operations ────────────────────────────────────────────
  // A parallel product for youth-league operators (registration, rosters,
  // scheduling, comms, payments) built on top of the same platform. Invisible
  // to every existing coach — gated behind LEAGUE_OPS_ENABLED and organizer
  // status — so every entry here is "beta"/"internal" until that gate lifts.
  {
    id: "league-operator-console",
    name: "League operator console",
    description:
      "A command-center dashboard for running a youth league or a whole portfolio of them — KPIs (leagues, teams, registrations, fill rate, revenue), a needs-attention queue (registrations to approve, teams without a coach, unrostered players, closing windows), and a sortable, filterable table of every league across cities and sports. Operators managing more than one organization get an org switcher so each org's numbers — revenue especially — never blend together.",
    category: "League operations",
    status: "beta",
    addedDate: "2026-06-20",
  },
  {
    id: "league-public-registration-payments",
    name: "Public registration, payments & merch store",
    description:
      "A shareable link (plus QR code) opens a mobile-friendly signup form for parents — player and guardian info, sport-specific questions, and optional merch/equipment add-ons with sizes — that goes straight to secure Stripe checkout. Operators set the registration fee, open/close window, and store catalog; approved signups flow into the roster queue automatically.",
    category: "League operations",
    status: "beta",
    addedDate: "2026-06-21",
  },
  {
    id: "league-teams-schedule-standings",
    name: "Teams, scheduling & standings",
    description:
      "Operators create divisions (with birthdate-window age gating), build teams, assign coaches, place approved players onto rosters, and schedule games and practices. Scores entered against the schedule roll up into automatic, sport-correct standings — points-and-differential for football, table points for soccer, win percentage for basketball and baseball.",
    category: "League operations",
    status: "beta",
    addedDate: "2026-06-21",
  },
  {
    id: "league-coach-playbook-distribution",
    name: "Coach playbook & practice-plan distribution",
    description:
      "For football leagues, operators seed every team a starter playbook and email the head coach a personal copy that lands ready to build on in their own XO Gridmaker account — the same classic playbook experience coaches already use. Operators can also build a practice plan once and distribute it to every team's coach in one click.",
    category: "League operations",
    status: "beta",
    addedDate: "2026-06-21",
  },
  {
    id: "league-delegated-access",
    name: "Delegated staff access (roles & permissions)",
    description:
      "League operators can grant teammates scoped access instead of sharing one login — a merch coordinator who can only manage the store, a local admin who only sees one city's leagues, a baseball coordinator who sees every baseball league across the portfolio. Access is defined by a role preset (or custom capability picks) crossed with a scope (portfolio-wide, specific leagues, a sport, or a league group), and every delegated action is authorized against that grant.",
    category: "League operations",
    status: "beta",
    addedDate: "2026-06-30",
  },
  {
    id: "league-multi-sport",
    name: "Multi-sport league support",
    description:
      "Leagues aren't football-only: operators pick a sport at creation (football, soccer, basketball, baseball, volleyball) and the whole console adapts — sport-correct standings and terminology (\"match\" and \"manager\" for soccer, \"game\" and \"coach\" for football), sport-specific registration questions, and the football-only playbook bridge cleanly hidden for every other sport.",
    category: "League operations",
    status: "beta",
    addedDate: "2026-06-30",
  },
  {
    id: "league-ai-assistant-leo",
    name: "Leo, the league AI assistant",
    description:
      "A chat assistant scoped to a league operator's own data — league status, who's not rostered yet, registration triage — that can also draft and, after an explicit human approval step, send announcements, place players on teams, and distribute practice plans. Every consequential action is proposed first and only runs once the operator approves it.",
    category: "League operations",
    status: "internal",
    addedDate: "2026-06-29",
  },
];

/** Group features by category, preserving the order they appear in FEATURES. */
export function featuresByCategory(): Array<{ category: FeatureCategory; entries: FeatureEntry[] }> {
  const map = new Map<FeatureCategory, FeatureEntry[]>();
  for (const f of FEATURES) {
    const cur = map.get(f.category);
    if (cur) cur.push(f);
    else map.set(f.category, [f]);
  }
  return Array.from(map.entries()).map(([category, entries]) => ({ category, entries }));
}
