# Track B — League Operator Console (in progress)

The operator's window into the league. Additive UI at `/league`, gated by the Wave 0 layout. No prod risk (read-only over the league data model). Built on `league/wave-0-foundation`.

## Slice 1 — Console shell + operational dashboard ✅ (built)

| File | What |
|---|---|
| [src/lib/league/console.ts](../../src/lib/league/console.ts) | Operator data access: `getMyLeagues()`, `loadLeagueDashboard()`, and pure `summarizeRegistrations()` (registration counts, unrostered queue, needs-review). RLS scopes reads to the user's leagues. |
| [src/lib/league/console.test.ts](../../src/lib/league/console.test.ts) | 4 unit tests on the pure aggregator. |
| [src/app/league/page.tsx](../../src/app/league/page.tsx) | League picker (replaces the Wave 0 placeholder) — lists the operator's leagues. |
| [src/app/league/[leagueId]/page.tsx](../../src/app/league/[leagueId]/page.tsx) | Per-league dashboard: structure (divisions/teams/coaches) + registration summary (total, needs-review, unrostered, by-status). |

Design notes:
- **Per-league isolation enforced in the page**, not just the layout: the layout confirms membership in *some* league; the `[leagueId]` page additionally checks membership in *that* league and 404s otherwise. (`params` is awaited — Next 16 fork convention.)
- **Operational gaps** Agent 1 emphasized are surfaced as first-class stats: needs-review (submitted) and unrostered (approved/waitlisted) queues. `teams-without-coach` waits on the coach↔team assignment model (next slice).

## Next slices ⏳
- Season/division/team CRUD; coach↔team assignment (then `teams-without-coach` gap).
- Registration review queue (approve/waitlist/reject, status transitions already modeled in `registration.ts`).
- Roster management (writes `team_members` with `league_id`).
- League branding editor (the `leagues.branding` cascade).

## Test status
`npx vitest run src/lib/league/` → 34 pass (access 12, eligibility 10, registration 8, console 4). `npm run typecheck` clean.
