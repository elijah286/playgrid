# Track A — Registration, Payments & Commerce (in progress)

The $30k-replacement vertical. Built incrementally on `league/wave-0-foundation`, additive + gated. Status of each slice below.

## Slice 1 — Registration intake data core ✅ (built)

| File | What |
|---|---|
| [supabase/migrations/20260620120200_league_registration.sql](../../supabase/migrations/20260620120200_league_registration.sql) | `registration_windows`, `player_registrations` (+ `registration_status`, `registration_payment_status` enums). RLS: league admins manage; a guardian sees/creates only their own submissions; status/roster decisions are admin-only. No public surface added. |
| [src/lib/league/eligibility.ts](../../src/lib/league/eligibility.ts) | Pure division-eligibility logic (birthdate-window, Date-free). **Soft** signal — surfaces warnings + reasons, never hard-blocks (PLAN.md open Q#1). `ageOn()` helper. |
| [src/lib/league/registration.ts](../../src/lib/league/registration.ts) | Status state machine (`canTransition`, `allowedTransitions`) + queue predicates (`isUnrostered`, `isActiveRegistration`). |
| [src/lib/league/eligibility.test.ts](../../src/lib/league/eligibility.test.ts) · [registration.test.ts](../../src/lib/league/registration.test.ts) | 18 unit tests (boundaries, missing/malformed birthdate, illegal transitions, terminal states). |

Design notes:
- **Eligibility is soft by default** — ineligible registrations are flagged with reasons for operator discretion, not rejected. Flip to hard-block later if you decide (open Q#1).
- **Roster link** — `player_registrations.team_id` is set when a player is rostered; the actual `team_members` write lands with the console/roster slice.
- **Lifecycle** mirrors Agent 1's Key States: submitted → approved → rostered | waitlisted | rejected | withdrawn.

## Slice 2 — Parent-facing intake UI ⏳ (next)
A league-specific link/QR landing (`/register/[leagueSlug]`) for anonymous parents. **Invisibility plan:** the route 404s unless `LEAGUE_OPS_ENABLED` is on AND the league exists AND a registration window is open — so during testing only the seeded `waco-test` league with a manually opened window is reachable, and only via the operator-shared link. Creates `player_profiles` + `parent_guardians` + `player_registrations` + computes the eligibility snapshot on submit.

## Slice 3 — Payments (Stripe Connect) ⏳ (focused pass, highest risk)
Per owner decision: **Stripe Connect → operator**. Operator connects their own Stripe account (KYC/1099 on them); the platform takes a cut. Implementation contract:
- A **new** `payment_intent.succeeded` + `checkout.session.completed(mode=payment)` branch in [api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts), keyed on `metadata.kind` (`league_registration`) — **never touch the subscription branches**.
- **Web-only on iOS** — reuse the `isNativeApp()` backstop; no new IAP SKUs (App Store 3.1.1).
- Staged behind a flag; verified in Stripe **test mode**; confirm coach subscription lifecycle still works post-change before any prod apply.
- Needs `league_invoices` / payment ledger tables (new, additive).

## Slice 4 — Merchandise ⏳ (droppable tail)
`products` / `orders` / `order_items`, combined checkout, AI catalog-from-photo. Depends on the **merch-fulfillment decision** (open Q#3 — self-managed vs Printful) before it's pilot-realistic.

## Cumulative test status
`npx vitest run src/lib/league/` → 30 pass (access 12, eligibility 10, registration 8). `npm run typecheck` clean. Still no live-DB harness — RLS isolation for the new tables follows the same manual procedure in WAVE-0.md.
