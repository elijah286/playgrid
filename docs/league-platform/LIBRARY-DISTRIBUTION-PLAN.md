# League library & distribution — architecture plan

**Status:** approved 2026-07-03 (all decision points confirmed by owner). Phase 0
not yet started — owner kicks it off. Supersedes the earlier "step 3: league
template playbook" idea and absorbs the snapshot-vs-sync question.

## The model

Three layers, cleanly separated:

```
LIBRARY (org-level, sport/variant-scoped)
  The operator's own content: play groups + practice plans, authored in the
  classic editor, tagged into custom collections ("new coaches", "advanced",
  "select"). Lives OUTSIDE any league.
        │  distribute (snapshot, one copy per team)
        ▼
TEAM PLAYBOOK (the existing 1:1 unit — unchanged)
  Created when the operator creates a team. THE playbook for that team:
  roster + plays + practice plans. Distributions merge INTO it as play
  groups; they never create second playbooks.
        │  invite (coach joins as member)
        ▼
COACH (one login → their playbook + roster)
  Rides the operator's seat for this playbook. Their own separate playbooks
  follow normal freemium rules, untouched.
```

Key insight driving the design: playbooks/practice plans are bound to sport +
game type, not to a league — so authored content lives at the org level
("Library"), and the per-league view is purely *distribution status* (what
from my library is on which team, sent/claimed, is a newer version out).

## Confirmed decisions (2026-07-03)

1. **Handoff = invite-membership, not copy-link.** The coach joins the
   org-owned team playbook (via `playbook_invites`, role coach) instead of
   claiming a detached copy. Future distributions flow into the playbook the
   coach actually uses; the operator-built roster is there at first login;
   ownership stays with the org (which is what makes "operator's seat"
   meaningful, and lets a replacement coach be invited to the same playbook
   if one quits mid-season). Copy-links remain untouched for the coach
   product's own sharing.
2. **Redistribute policy = add-only + version-suffixed groups.** Distributed
   content is a snapshot; updates land as a new version-suffixed group
   (e.g. "Install 1 (v2)"), never mutating plays the coach may have edited.
3. **Seat consumed on invite ACCEPT**, not on send.

## Why this fits the existing schema with zero coach-core changes

| Model concept | Existing mechanism |
|---|---|
| "Groups of plays added to the coach's playbook" | `playbook_groups` (migration 0008) — named play groupings within a playbook; `plays.group_id`. A distribution lands as a new group. |
| Practice-plan distribution | Already shipped — `src/lib/league/curriculum-distribute.ts` copies self-contained snapshots, one per team, idempotent. |
| 1:1 playbook↔team | Already a norm + `playbooks_default_per_team_idx` (0007, default playbook per team), enforced by seeding idempotency (`seedOneTeam` in `src/app/actions/league-playbooks.ts`). Nothing to change. |
| "Coach sees their playbook + roster at login" | `playbook_invites` (0023) — token carries a role; accepting inserts membership, and "join puts you on roster" (2026-06-26) auto-adds them to the roster with claim/merge against pre-added names. |
| "Uses a seat belonging to the operator" | Seats already exist in billing (Team Coach includes 3, Coach Pro 5, add-ons purchasable — `src/lib/site/seat-defaults-config.ts`). |
| Coach's free quota unaffected | The free-tier quota counts **owned** playbooks only (`playbook_members.role = "owner"` in `src/lib/data/playbook-create.ts`); an invited coach is a member, not an owner. No code change — pin with a test. |

All new persistence is additive `league_*` tables, so the coach-core
migration linter (`scripts/check-coach-core-migrations.ts`) passes by
construction.

## New data model (all additive)

- **`league_library_items`** — the registry: `owner_id`, `kind`
  (`play_group` | `practice_plan`), pointer to the source
  (`source_playbook_id` + `source_group_id`, or `source_practice_plan_id`),
  `title`, `sport`, `variant`, `tags text[]` (custom collections). The
  operator authors in their own playbooks via the classic editor — the
  library is metadata over that content, not a second authoring surface.
- **`league_library_defaults`** — `item_id` × `variant` × `league_id`
  (nullable = org-wide): "every new Flag 7v7 team gets these." Applied
  automatically at team creation.
- **`league_distributions`** — the ledger: item, snapshot version, league,
  team, target playbook + group, who/when. Powers the per-league status
  board and makes redistribution auditable.
- Handoff status comes from `playbook_invites` acceptance (replacing
  `playbook_copy_links.uses_count` as the "claimed" signal on league sends).

## Licensing (seat rules)

- **Team playbook**: pro features key off the *operator's* entitlement; each
  coach-accepted league playbook consumes one operator seat (on accept).
  Operators see seats used/available on People & access.
- **Coach's own playbooks**: normal freemium — the free tier's one limited
  playbook is still available; upgrades apply to their own content only.
- **Coach Cal**: per-user as today — eval prompts free, license to buy.
  Operator-bundled Cal stays a future toggle (permitted by PLAN.md owner
  decisions), out of this critical path.

## IA changes

- **Library** becomes a portfolio-level rail item (alongside All leagues /
  People & access) — grouped by sport/variant, filterable by tag, defaults
  manageable inline, "New playbook ↗ / New practice plan ↗" opening the
  classic editor in a new tab (hard rule: classic editor UX untouched).
- The per-league **Playbooks** page keeps the shipped shape (batch panel +
  status board) but sources become library items instead of the 3 canned
  starters; **Curriculum** folds into it (one "Distribute" surface per
  league).
- **Team creation** gains the seeding moment: create team → default playbook
  + variant defaults applied → optional coach invite if email present.

## Phases

| Phase | Scope | Risk |
|---|---|---|
| **0** | Entitlement-gate audit (which per-playbook pro-feature gates check the viewing user's tier vs the playbook owner's — the seat model needs "playbook follows the org's plan"); pin two regression tests (member-not-owner quota; invite→accept→roster path) | none — read-only + tests |
| **1** | Library tables + org Library page (register items from existing playbooks, tags, defaults) | low — additive, league-gated |
| **2** | Play-group distribution into team playbooks; team-creation auto-seed; invite-based handoff replacing copy-link on league sends; status board rewired to the ledger | medium — writes into coach-side playbooks via the same copy helpers curriculum already uses; isolation guardrails + tests |
| **3** | Seat accounting + entitlement keying for provisioned playbooks | **highest** — billing-adjacent; branch + owner review before merge, tests first |
| **4** | Redistribute/update UX ("v2 available"), Curriculum merge, Cal-bundling decision | low |

Model guidance (owner's working convention): Phase 0/1 fine on Sonnet;
Phases 2–3 on Opus/Fable. Everything already shipped keeps working
throughout — outstanding copy-links stay claimable, seeded playbooks stay
valid; new sends switch to invites when Phase 2 lands.

## Compatibility guarantees

- No migrations touch coach-core tables (`teams`, `playbooks`, `plays`,
  `profiles`, `playbook_members`) — additive `league_*` only.
- The classic playbook editor and every coach-product flow are unchanged;
  league surfaces stay invisible-by-default behind the organizer gate.
- The current copy-link handoff continues to work for anything already sent.
