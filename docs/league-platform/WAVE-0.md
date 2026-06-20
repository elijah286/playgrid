# Wave 0 — Foundation (built, on branch, NOT merged / NOT applied to prod)

Branch: `league/wave-0-foundation`. Nothing here has touched `main` or the production database. This doc is the review + verification guide.

## What shipped

| Area | File | Notes |
|---|---|---|
| Tenancy + roles + RLS | [supabase/migrations/20260620120000_league_foundation.sql](../../supabase/migrations/20260620120000_league_foundation.sql) | `leagues`, `league_divisions`, `league_members` (+ `league_sport`, `league_member_role` enums); nullable `teams.league_id` / `teams.league_division_id` / `seasons.league_id`; helpers `is_league_member`, `is_league_admin`, `has_league_access`; RLS on all three tables. |
| People + consent + audit | [supabase/migrations/20260620120100_league_people_consent_audit.sql](../../supabase/migrations/20260620120100_league_people_consent_audit.sql) | `player_profiles`, `parent_guardians`, `guardian_links`, `minor_consent_records` (+ `consent_kind` enum), `league_audit_log` + `log_league_audit()`. PII is league-admin scoped, not blanket site-admin. |
| Access layer | [src/lib/league/access.ts](../../src/lib/league/access.ts) | Kill switch `leagueOpsEnabled()`, `getCurrentLeagueMemberships()`, `hasLeagueAccess()`, `isLeagueAdmin()`, role helpers. |
| Tests | [src/lib/league/access.test.ts](../../src/lib/league/access.test.ts) | 12 pure-unit tests of the gate logic (kill switch, member vs non-member, admin roles). |
| Gated route | [src/app/league/layout.tsx](../../src/app/league/layout.tsx) + [src/app/league/page.tsx](../../src/app/league/page.tsx) | `/league` 404s for non-members and when the kill switch is off; landing page proves the wiring. |
| Test-account seed | [scripts/seed-league-operator.mjs](../../scripts/seed-league-operator.mjs) | Provisions `league@xogridmaker.com` + a test league + operator membership. **Not run yet.** |

## Zero-impact guarantees (and how each is enforced)

1. **No existing file was modified.** Wave 0 is purely additive — new migrations, new `src/lib/league/`, new `src/app/league/`, new script. The shared nav, dashboard, auth, and Stripe code are untouched, so current web/native UX is byte-for-byte unchanged. (Verify: `git diff --stat main` shows only additions.)
2. **`profiles.role` untouched.** League roles live in `league_members`; `is_site_admin()` and the ~30 global admin actions are unaffected.
3. **Existing coach data invisible to league queries.** `teams.league_id` / `seasons.league_id` are nullable; existing rows are NULL and excluded from every league path.
4. **League data invisible to existing users.** All league tables are RLS-scoped to `league_members`. A user with no membership (every current user) gets zero rows even hitting an endpoint directly.
5. **Surface invisible + unreachable.** `/league` 404s unless the user is a member AND the kill switch is on. No nav entry is added anywhere, so the route is reachable only by directly visiting it as the gated account.
6. **One-switch rollback.** `LEAGUE_OPS_ENABLED=off` (Cloud Run env) makes the whole surface 404 with no deploy.

## Verification

### Automated (runs in `npm run test`)
- `npx vitest run src/lib/league/access.test.ts` → 12 pass. Covers: kill switch on/off, non-member → no access, member → access, admin-role classification, per-league admin scoping.
- `npm run typecheck` → clean.

### Manual — RLS cross-league isolation (REQUIRED before merge)
The repo has **no live-DB/RLS test harness** (vitest is jsdom + mocked Supabase), so multi-tenant isolation must be verified by hand against a staging/prod-clone DB after the migrations are applied:

1. Apply migrations to a non-prod Supabase (`npm run db:migrate` against a staging project, or paste the two SQL files into the SQL editor).
2. Seed two leagues (A, B) with one operator each and a player in each.
3. Sign in as operator A; confirm:
   - `/league` lists only league A.
   - Querying `league_members`, `player_profiles`, `minor_consent_records` returns **zero** league-B rows.
   - A coach/parent role in A cannot read A's `minor_consent_records` (admin-only).
4. Sign in as a normal coach account (no membership); confirm `/league` 404s and all league tables return zero rows.

## Provisioning the test account (run AFTER migrations are applied; not done yet)

```bash
# .env.local must contain NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# and SEED_LEAGUE_OPERATOR_PASSWORD (the credential — never commit it).
node scripts/seed-league-operator.mjs
```

Creates `league@xogridmaker.com` (profile role `user`), a "Waco Test League", and an `operator` membership. Then sign in and visit `/league`.

> Security note: the test credential is read from env and never stored in the repo. Before this account ever sees real registrations (minors' PII), give it a strong, unique password — not a shared/known one.

## Deferred to later tracks (intentionally NOT in Wave 0)

- **Privacy-policy publish → Track A.** Data collection begins with registration intake, so the public [privacy/page.tsx](../../src/app/privacy/page.tsx) edit ships with that. Draft clause to publish then:
  > **League registration & minors.** When a parent/guardian registers a child with a league, we collect the player's name, birthdate (to verify age divisions), and guardian contact details, plus any waivers/consents the league requires. This data is visible only to administrators of that league and the child's linked guardians, is never sold, and is deleted when the player or league is removed.
- **Features-catalog entry → Track B.** Wave 0 is internal foundation; the catalog entry lands with the user-facing operator console.
- **Consent-gated roster approval → Track A.** The `minor_consent_records` table exists now; the validator that blocks roster approval without consent lands with the registration/roster flow.
- **Nav integration → Track B.** Deliberately no nav entry yet, to keep the surface invisible.

## Status
Built on `league/wave-0-foundation`, **uncommitted** pending your review. Not merged to main. Migrations not applied to any database. Test account not created.
