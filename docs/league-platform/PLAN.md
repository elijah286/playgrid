# XO Gridmaker → League Operations Platform — Implementation Plan

**Status:** Wave 0 built on branch `league/wave-0-foundation` (uncommitted, not merged, not applied to prod) — see [WAVE-0.md](WAVE-0.md). Tracks A–D not started.
**Pilot:** Waco-area youth football, spring 2027 · **Driver:** replace operator's ~$30k/yr registration tool
**Author:** grounded in a 10-subsystem codebase investigation (auth, schema, payments, Cal, comms, playbook domain, iOS compliance, feature-gating, existing tenancy).

---

## 1. What we're building

A **multi-tenant youth-sports league operations platform** layered on XO Gridmaker's existing single-tenant coach-playbook product. League operators get a console (seasons/divisions/teams, coach assignment, registration review, rosters); parents register players via a league link/QR and pay fees + buy merch via web checkout; admins broadcast to targeted audiences; coaches receive league-distributed playbooks/practice-plans; an AI layer assists ops (recommend-then-approve).

**Reality check: ~70% net-new, 30% extension.** The product today is hard *one-org-per-user* (`ensureDefaultWorkspace` auto-creates one org per user; no multi-membership join table exists across 273 migrations). The league tenancy graph (League → Division → Team → Roster → Parent/Player) is entirely new. We **share the rails** — auth/Supabase/RLS pattern, Stripe + Apple-IAP plumbing, play render pipeline, Resend/push/inbox infra — but this is a new product surface, deliberately isolated under a `/(league)` route group to avoid coach-product cannibalization and App Store risk.

### 1.1 Non-negotiable: ZERO impact on the existing product
Every league feature is **invisible and inert** for all current users — no nav entry, no route, no data exposure, no behavior change on web or native — until an account is explicitly gated in. This is the highest-priority constraint and supersedes any convenience that would leak league UI into the current experience. Gating is **two layers**:

1. **Global access gate (beta allowlist / entitlement)** — controls whether the `/(league)` surface and its entry points render *at all* for a user. Models the existing Coach AI beta-gate pattern (`COACH_CAL_*`-style). During testing, exactly one account is on the allowlist: `league@xogridmaker.com`. Disabling the gate makes the entire surface vanish with no deploy (kill switch).
2. **Scoped role (`league_members`)** — for an allowlisted user, *which* league(s) they operate and what they can do inside (operator / league_admin / coach / parent / player).

Current coach/web/native UX stays byte-for-byte unchanged: league nav never renders for non-allowlisted users, `/(league)/*` routes 404/redirect, and league tables are RLS-invisible to non-members. Existing coach teams remain `league_id=NULL` and invisible to all league queries (reverse isolation).

## 2. Owner decisions (locked 2026-06-20)

| Decision | Choice | Implication |
|---|---|---|
| Payments routing | **Stripe Connect → operator** | Operator connects own Stripe acct, does KYC/1099; platform takes a cut. Cleanest tax posture. Per-league Connect onboarding step. |
| Spring pilot scope | **Full**: reg+payments+console **+ comms + curriculum + merch + scheduling/standings** | Large scope. Mitigation: each Wave-1 track ships a thin slice first; merch & scheduling are the most droppable if timeline slips. |
| iOS scope | **Some league capability in-app** | Allowed for *non-commerce* (viewer, console, comms, schedules). **Commerce stays web-only** — see §3.1. |
| Cal & leagues | **Leagues may bundle/distribute Cal** | Needs a league-granted Cal entitlement path + cost-cap accounting; price the league license to capture Cal cost. See §3.4. |
| Visibility | **Invisible to everyone except gated accounts** | Two-layer gate (§1.1, §3.5). Existing UX unchanged. Kill switch, no deploy. |
| Test account | `league@xogridmaker.com` (league operator) | Sole allowlisted account during testing. Credential handled out-of-band — **never committed to the repo**. |

## 3. The constraints that shape everything (critical)

### 3.1 iOS / Apple IAP — the precise safe line
The app is **actively mid-resubmission** (build 10, Guideline 4.8). "Some league capability in-app" is fine **as long as no money moves through the native app**:
- ✅ **In-app (native OK):** league viewer, operator console, roster management, communications, schedules/standings, RSVP, curriculum viewing — all non-commerce operations.
- ❌ **Web-only (never native):** registration-fee checkout, merchandise checkout. Apple 3.1.1 forbids physical goods via IAP; real-world league fees collected to the operator via Stripe are external commerce that Apple does not allow inside the app, and in-app links to external payment invite anti-steering rejection.
- **Mechanism:** reuse the existing `isNativeApp()` backstop in [checkout/ui.tsx](src/app/checkout/ui.tsx). On native, commerce surfaces render a neutral "continue on the web" notice. **Add zero new IAP SKUs to App Store Connect.**

### 3.2 RLS multi-tenant isolation
Every existing admin action checks the **global** `profiles.role='admin'`. **Do NOT add `league_admin` to `profiles.role`** — it would make `is_site_admin()` transitively grant site-wide access to a league operator. League roles live in a new scoped `league_members(league_id, user_id, role)` table with a `requireLeagueAdmin(leagueId)` guard; `profiles.role` and `is_site_admin()` stay untouched. **Cross-league isolation tests are a Wave-0 deliverable** (a coach in league A gets zero rows from league B).

### 3.3 COPPA / minors' consent
`team_members.is_minor` is a bare boolean — no parent link, consent record, or audit trail. `parent_guardians` + `minor_consent_records` + `audit_log` ship **day one**; roster approval is blocked at the RLS/validator layer when consent is missing. Bump [privacy/page.tsx](src/app/privacy/page.tsx) + re-check App Store privacy labels in the same release. **Launch-gating; engage legal before spring.**

### 3.4 Revenue-protection seams
- **Stripe webhook:** the single switch in [api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts) drives ALL coach subscription billing. Registration/merch get a **new** `payment_intent.succeeded` + `checkout.session.completed(mode=payment)` branch keyed on `metadata.kind` — **never touch the subscription branches**. Stage behind a flag, verify in Stripe test mode.
- **Cal bundling (per owner decision):** league licenses can distribute Cal. This needs (a) a league-granted Cal entitlement that coexists with per-coach subscriptions in the downgrade/lock logic, and (b) cost-cap accounting so a league handing Cal to N coaches is metered (`coach_ai_usage` / `coach-ai-cost-cap.ts`). Price the league license to cover the Cal token cost. Keep advanced authoring gating intact.
- **Play caps:** league-distributed template plays must be excluded from `computeDowngradeLocks()` counting (tag with `plays.source_league_id`), or free coaches absorb a whole library and collapse the premium upsell.

### 3.5 Gating mechanism (how §1.1 zero-impact is enforced)
- **Access gate is a separate flag/allowlist, NOT `profiles.role`** — keeps §3.2 intact (no site-admin leakage). Model after the Coach AI beta gate; expose a server-side `hasLeagueAccess(userId)` check + an env kill switch.
- **Entry points:** league nav/menu items render only when the access gate passes. Current users render the exact same tree as today.
- **Routes:** a `/(league)` layout guard returns 404/redirect when the gate fails — the surface is not just hidden, it's unreachable.
- **Data:** league tables are RLS-scoped to `league_members`; every non-member (i.e. every existing user) gets zero rows even if they hit an endpoint directly.
- **Kill switch:** disabling the access gate hides the entire surface with no deploy, mirroring the `COACH_CAL_*` convention. This is the rollback if anything leaks.
- **Provisioning:** Wave 0 ships the gate + adds `league@xogridmaker.com` to the allowlist with an operator-role `league_members` row for a seeded test league.

## 4. Canonical shared entities (the vocabulary every track must agree on)

| Entity | Exists today? | Notes |
|---|---|---|
| League | ❌ new | Top-level tenancy. `organizations` is NOT a league (it's a single-coach workspace). |
| Division / AgeGroup | ❌ new | Under League; drives eligibility + roster caps. |
| Season | ⚠️ partial | `seasons` exists (team-scoped); add `league_id`. |
| Team | ✅ extend | Add nullable `league_id` FK; existing coach teams stay `league_id=NULL`, invisible to league queries. |
| Roster entry | ✅ extend | `team_members` (nullable user_id slots, role enum, `is_minor`, `roster_claims`) is the best-fit primitive; add parent link + registration status + consent. |
| Coach (league assignment) | ⚠️ partial | `profiles.role='coach'` exists; league coach↔team assignment is new — model in `league_members`, don't overload `profiles.role`. |
| Parent / Guardian | ❌ new | COPPA-critical. |
| Player / PlayerProfile | ❌ new | DOB/grade/eligibility attrs for age-division logic. |
| Registration | ❌ new | Core of the $30k replacement. |
| Order / OrderItem / Product | ❌ new | Web-only checkout; likely third-party fulfillment. |
| Payment / Invoice | ⚠️ plumbing only | Subscriptions exist; no one-time payment_intent handler, no Connect, no ledger. |
| Message / Broadcast | ❌ new | Reuse Resend/push/inbox *rails*; `playbook_messages` (1:1 chat) is NOT reusable. Add `league_broadcasts` + `audience_segments` + league-scoped opt-outs. |
| PracticePlan / Drill / Playbook | ✅ reuse | `practice_plans`, play editor, Learning Center render path, `InstallButton` all exist — directly reusable for distribution. |
| LeagueMembership / Role | ❌ new | Canonical role vocab (operator/league_admin/coach/parent/player/volunteer) lives HERE. |
| AuditLog / ConsentRecord | ❌ new | Compliance-critical, day one. |
| Game / Schedule / Standings | ⚠️ partial | `game_sessions`/`playbook_events`+RSVP exist; league-wide scheduling extends these. |

## 5. Build order & parallelization

### Wave 0 — Foundation (ONE agent, sequential, branch + review before merge)
**Do not parallelize.** This is the shared vocabulary; fragmenting it across agents corrupts the schema/role/RLS contract. Risk class: auth + migrations + multi-tenant RLS = maximum per AGENTS.md → stage on branch, owner reviews, then main.

Deliverables:
1. Tenancy: `leagues`, `divisions`, `teams.league_id` (nullable FK), `seasons.league_id`. Additive; existing coach data untouched (`league_id=NULL`).
2. Identity/role: `league_members` + RLS helpers (`is_league_member`, `is_league_admin`, `requireLeagueAdmin`) — **parallel to, never replacing, `is_site_admin()`**.
3. Parent/consent/audit: `parent_guardians`, `player_profiles`, `minor_consent_records`, `audit_log`.
4. Sport-agnostic discipline: no football-only columns in any league/registration/team table. (Football catalogs stay football-only.)
5. **Access gate** (§3.5): `hasLeagueAccess()` + env kill switch; membership-as-allowlist; `/league` layout guard. Seed `league@xogridmaker.com` as operator on a seeded test league.
6. **Cross-league isolation tests** — unit tests of the gate logic (shipped); manual RLS isolation procedure documented (no live-DB harness exists). Privacy publish + features-catalog entry deferred to Track A / Track B respectively (data collection / user-facing UI start there), with the privacy clause drafted now.

**Schema-contract freeze:** once Wave 0 merges, the entity shapes + RLS helpers are frozen. Wave-1 agents consume them and add only their own additive tables.

### Wave 1 — Feature verticals (fan out into ~4 parallel agents/worktrees AFTER Wave 0 merges)

Each brief below is a self-contained agent spin-up. **Hard rule for all: add only your own additive tables; never modify foundation tables or RLS; coordinate migration numbering.**

**Track A — Registration + Payments + Commerce** *(highest value; the $30k replacement)*
- Scope: league-link/QR registration intake, eligibility validation (soft-warn + override audit recommended), player registration status workflow; Stripe **Connect** onboarding per operator; `payment_intent` webhook branch keyed on `metadata.kind`; combined reg+merch checkout; merch catalog + orders (web-only on iOS); AI catalog-from-photo (reuse Cal's vision/upload pattern).
- Coordinate: owns the new Stripe webhook branch; must not touch subscription branches.
- Sequence internally: registration → payments → merch (merch is the droppable tail).

**Track B — League Operator Console** *(pilot-critical)*
- Scope: new `/(league)` route group — admin dashboard, league branding, season/division/team CRUD, coach assignment, roster overview, **unassigned-player queue + operational-gap surfacing** (no-coach teams, uneven divisions, incomplete registrations). Replicate the lazy-loaded tab pattern of `/settings` but live in its own route group, never inside site-admin.
- Coordinate: consumes Track A registration data; stub against foundation early.

**Track C — Communications + Broadcasts**
- Scope: compose → target audience (league/season/division/team/coaches/parents/unrostered) → send via email + in-app; message history; per-league sender branding; AI draft (recommend-then-approve). Extends Resend/push/inbox rails.
- Coordinate: **owns the notification opt-out scoping migration** — add league-scoped opt-out rows checked *in addition to* global ones; add an `audience` field (parent_only/coach_only) to push categories for stale-client safety; per-league sending domain + List-Unsubscribe on bulk. Must not relax global opt-outs (shared with coach product).

**Track D — Curriculum + Practice-plan Distribution** *(highest code reuse)*
- Scope: league template playbooks/practice-plans/drills, install path to coaches via existing `InstallButton` + editor + Learning Center render path; coach-facing "assigned content" surface; AI-assisted practice/curriculum drafts (review before distribution). Per owner decision, league-bundled Cal entitlement lands here or in billing.
- Coordinate: **owns the `computeDowngradeLocks()` play-cap exclusion** for league-template plays (tag `source_league_id`).

### Wave 2 — Deferred (build after pilot foundation is proven)
- **Scheduling + Standings** — extends `playbook_events`/RSVP to league level. In pilot scope per owner, but most droppable; ship a simple schedule view first.
- **League-Ops AI "Leo"** — separate agent from Cal (shares only the spec→projection *pattern*, never Cal's catalogs/provenance gate). Roster recommendations, comms drafts, catalog population, admin Q&A — all recommend-then-approve with an audit gate. Not pilot-blocking; humans do ops manually season 1.

## 6. Should we spin up separate agents? — Yes, in two waves
- **Now:** one agent builds Wave 0 to a branch; owner reviews schema + RLS; merge.
- **After merge:** spin up Tracks A–D as parallel agents/worktrees. Low collision risk because each is additive + new routes, **provided** the schema-contract freeze and the two coordination hand-shakes (opt-out scoping in C, play-cap exclusion in D) are honored.
- **Defer** Leo + Scheduling until the foundation + core verticals are proven.

## 7. Open questions still to resolve (non-blocking for Wave 0)
1. **Eligibility enforcement:** hard block out-of-division vs soft-warn + override + audit? (Recommend soft+audit — youth leagues need operator discretion.)
2. **Parental consent UX:** embedded form vs emailed e-signature vs guardian portal? (Shapes registration UX + COPPA audit; legal input.)
3. **Merch fulfillment:** self-managed vs third-party (Printful/Bonfire)? Existing print infra is wristbands/sheets only — not apparel. Determines whether merch is realistic for the pilot.
4. **Multi-org UX:** when a coach belongs to multiple leagues/orgs, what's the default context on login? (Product is currently hard one-org-per-user.)
5. **Coach-in-league entitlement SLA:** if a coach cancels their Coach subscription but is a registered league participant, what access persists?

## 8. Top risks (severity · mitigation)
- **iOS commerce rejection (critical)** — web-only commerce, `isNativeApp()` backstop, no new IAP SKUs.
- **RLS cross-league PII leak (critical)** — scoped `league_members`, mandatory `league_id` predicate, isolation tests as Wave-0 deliverable.
- **COPPA / minors' consent (critical)** — consent + audit day one, roster-approval block, privacy bump, legal review.
- **Stripe webhook regression (high)** — new `metadata.kind` branch only, never touch subscription branches, test-mode verify.
- **Revenue cannibalization (high)** — play-cap exclusion + league-Cal entitlement priced to cover cost.
- **Notification collision / CAN-SPAM (medium)** — league-scoped opt-outs additive to global, per-league domain, List-Unsubscribe.
- **Scale (medium)** — index league tables on `(league_id, …)` from the start; paginate rosters; time-bucket cron by league.
