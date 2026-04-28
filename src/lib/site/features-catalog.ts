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

  // ── Plays & formations ──────────────────────────────────────────
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
    id: "playbook-header-team-coach-locks",
    name: "Locked menu items show \"Team Coach\" badge",
    description:
      "In the playbook header overflow menu, items that require Team Coach (Invite team member, Send a copy, Duplicate) now display a small lock badge for free users instead of revealing they're locked only on click. The full upgrade modal still fires when the item is clicked.",
    category: "Roster & sharing",
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
    id: "play-cap-soft-warn",
    name: "Play-cap soft warning",
    description:
      "Free owners see a banner inside the Plays tab as they approach the per-playbook play cap (within 3 of the limit) and a stronger lock-flavored banner at the cap, both linking to /pricing?upgrade=play-cap. Replaces the previous silent failure when adding a 17th play.",
    category: "Billing & accounts",
    status: "ga",
    addedDate: "2026-04-28",
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
    id: "admin-users",
    name: "User administration",
    description:
      "Search users, edit roles, audit playbook membership, impersonate for support.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2025-09-01",
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
  {
    id: "admin-feature-list",
    name: "Feature catalog",
    description:
      "This page. Source-of-truth inventory of shipped capabilities, maintained alongside the codebase.",
    category: "Admin tools",
    status: "internal",
    addedDate: "2026-04-28",
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
