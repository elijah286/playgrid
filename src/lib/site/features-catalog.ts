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
  | "Admin tools";

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

  // ── Roster & sharing ───────────────────────────────────────────
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
      "Coaches on the free tier can add, rename, and edit their full roster (names, jersey numbers, positions) inside any playbook. Inviting players to actually join — sending links, approving claims, granting coach access — remains a Team Coach feature, so the upgrade moment lands when the coach is ready to share, not when they're organizing.",
    category: "Roster & sharing",
    status: "ga",
    addedDate: "2026-05-01",
  },
  {
    id: "roster-invites",
    name: "Invite team members",
    description:
      "Coaches generate links/codes that grant view or edit access to a playbook. Roles: owner, editor, viewer.",
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
    id: "site-admin-coach-ai-feedback-clusters",
    name: "Site admin · AI Feedback sub-tabs (Inbox / Clusters / Trends / KB History)",
    description:
      "The Site admin → AI Feedback page is now organized into four sub-tabs. Inbox keeps the existing raw signal queue (KB misses, refusals, thumbs up/down). Clusters surfaces an LLM-drafted KB review queue: a nightly job (plus on-demand \"Refresh clusters\") groups recent failure signals by topic and proposes a candidate KB chunk per cluster, which the admin can edit, approve (publishes to global KB), or reject. Trends shows daily signal counts and top miss topics for a 7/30/90-day window. KB History lists every recent rag_documents revision with one-click revert to a prior snapshot. Closes the loop from \"coach asks something Cal can't answer\" to \"approved KB chunk\" without manual triage.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-02",
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
    id: "coach-cal-compose-revise-architecture",
    name: "Coach Cal compose/revise architecture + defensive renderer",
    description:
      "Coach Cal's play-composition pipeline rebuilt from validators-as-gatekeepers to constructive-tools-as-source-of-truth. New tools — compose_play, revise_play, compose_defense — produce coach-canonical fences from intent (concept name + optional overrides for compose; player + intent-level mods for revise). Cal cannot freelance route geometry because Cal never authors waypoints. Every fence passes through a defensive sanitizer (drops oversize zones, NaN coords, out-of-bounds players) before display, so corrupt schema can never paint the whole field or stack players on top of each other. Identity-preservation is enforced inside revise_play (players[] is byte-equal across batched mods), making the \"Why did you flip it?\" regression structurally impossible. Old tools (get_concept_skeleton, modify_play_route, add_defense_to_play, place_defense) stay registered as backward-compatible aliases so existing chats continue to work.",
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
    id: "admin-coach-cal-upgrade-banner",
    name: "Coach Cal upgrade banner toggle",
    description:
      "Site Admin → Site → Coach Cal upgrade banner switches a maintenance notice on/off at the top of the Coach Cal chat window so entitled users know Cal is being actively upgraded and may behave unusually.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-05-02",
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
