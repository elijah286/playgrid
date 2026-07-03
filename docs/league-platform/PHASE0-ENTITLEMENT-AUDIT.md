# Phase 0 — entitlement-gate audit

Companion to [LIBRARY-DISTRIBUTION-PLAN.md](LIBRARY-DISTRIBUTION-PLAN.md).
Audited 2026-07-03 against main. Question: for each pro-feature gate, does it
key off the **viewing user's** entitlement or the **playbook owner's**? The
seat model requires playbook-scoped features to follow the owning org's plan.

## Headline

The owner-keyed architecture **already exists and is the documented
convention** — `getPlaybookOwnerEntitlement()` (owner-entitlement.ts: "Free
invitees of a Coach+ owner inherit the owner's unlocked features"),
`features.ts` as the single source of truth, and a **complete seat system**
(seats.ts: included + purchased seats, free-tier editors consume a seat,
Coach+ collaborators ride free, consumption keyed to ACTIVE membership — i.e.
on accept, matching plan decision #3). Phase 3 is therefore **smaller than
budgeted**: two structural gaps + one gate-keying cleanup, no new billing
concepts.

## Gap 1 — owner resolution returns null for league playbooks

`getPlaybookOwnerId()` resolves the owner via `playbook_members.role="owner"`.
League-seeded playbooks deliberately have **no owner-member row** (see
league-playbooks.ts: "keeps seeded playbooks OUT of the operator's personal
membership/quota"). So `getPlaybookOwnerEntitlement()` → null → gates treat
the playbook as free tier: the invited coach hits the 16-play cap, watermark,
no wristbands — despite the operator paying.

**Phase 3 fix:** fallback in `getPlaybookOwnerId` — no owner member AND the
playbook's team has `league_id` → resolve to the league operator
(`teams.league_id → leagues.created_by`). One function, one join, every
owner-keyed gate inherits the fix.

## Gap 2 — seat accounting can't see league playbooks

`getSeatUsage` / `getSeatCollaborators` / `getPendingCoachInvites` / the
`seats_used` RPC all scope to "playbooks where the owner has an owner-member
row" — league team playbooks are invisible to the ledger, so league coaches
would never consume operator seats.

**Phase 3 fix:** include org-owned league team playbooks in the owner's
playbook set (RPC + the two list functions), and have the league invite
action call `ensureSeatsAvailable(operatorId)` before sending.

## Gate classification

### Owner-keyed today — inherit Gap 1's fix, no other change

| Gate | Where |
|---|---|
| Per-playbook play cap | `play-cap.ts` `assertPlayCap` → 4 enforcement sites in `actions/plays.ts` |
| Tutorial play seeding cap | `actions/tutorials.ts:132` |

### User-keyed BY DESIGN — correct under the model, do not change

| Gate | Where | Why it stays user-keyed |
|---|---|---|
| Coach Cal | `api/coach-ai/stream/route.ts:91` (`getCurrentEntitlement` + free-prompt allowance) | Plan rule: league coach gets eval prompts only; Cal is a per-user purchase |
| Playbook-creation quota | `lib/data/playbook-create.ts` (counts role=owner only) | The property the seat model rests on — pinned by `playbook-create.memberQuota.test.ts` |
| Duplicate / example-claim / copy-claim quotas | `actions/playbooks.ts`, `example-claim.ts`, `copy/[token]`, `copy/example` | Claiming/duplicating consumes YOUR slot |
| Copy-link + coach-invite SEND gates + seat guard | `actions/copy-links.ts`, `actions/invites.ts` (sender coach+, `ensureSeatsAvailable`) | Sender-side; the league path has its own gate + will call operator-keyed seat check |
| Roster claim seat guard | `actions/playbook-roster.ts:882` | Already owner-keyed via `ownerId` var — correct |
| Downgrade locks, account UI | `lib/billing/downgrade-locks.ts`, `account/page.tsx` | About the user's own subscription |

### User-keyed but SHOULD follow the playbook owner — Phase 3 change list

These are viewer-keyed today, which is **already inconsistent with the
"invitees inherit" doctrine for the existing coach-collaborator seats
feature** (a free assistant coach on a paying owner's playbook is locked out
of Game Mode). Fixing them for the league model fixes that too:

| Gate | Where |
|---|---|
| Game Mode | `playbooks/[playbookId]/game/page.tsx:102`, `playbooks/[playbookId]/page.tsx:293`, `plays/[playId]/edit/page.tsx:201` |
| Wristbands + watermark removal | `playbooks/[playbookId]/print/page.tsx:111,116` |
| Playbook-page team-feature affordances (`viewerIsCoach`, `viewerCanUseTeamFeatures`, `userTier` prop) | `playbooks/[playbookId]/page.tsx:292-294,496` |

**Phase 3 fix:** one helper — `getPlaybookFeatureEntitlement(playbookId)` =
max(viewer, resolved owner) — swapped into these ~6 callsites. Per-feature
review at that point: send-copy BY a league coach may deliberately stay
user-keyed (redistribution is an operator concern).

## Pinning tests added in Phase 0

- `src/lib/data/playbook-create.memberQuota.test.ts` — the free-tier quota
  query filters `role="owner"`; memberships never count; Coach+ skips the
  quota; at-cap free coach blocked.
- `src/app/actions/invites.acceptInvite.rolePin.test.ts` — on the LIVE
  `accept_invite` SQL definition: membership role comes from the invite row
  (never a literal), conflict path can keep-or-upgrade but never demote,
  `'owner'` is never assigned by acceptance, and roster-approval behavior
  (join-puts-you-on-roster) is present.

## Revised Phase 3 scope

1. `getPlaybookOwnerId` league fallback (small).
2. Seat-ledger visibility for league playbooks + league invite seat guard
   (medium — includes the `seats_used` RPC).
3. `getPlaybookFeatureEntitlement` helper + ~6 callsite swaps (small-medium).

No new tables, no new billing concepts, no changes to price/tier logic.
