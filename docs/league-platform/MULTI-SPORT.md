# Multi-sport for league operators — design

**Scope:** support sports beyond football (soccer, basketball, baseball, volleyball, …) on the **league-operator** side only. The coach product / playbook editor stays **football-only**.

## TL;DR — this is mostly already built

The league schema was deliberately designed sport-agnostic from day one (`20260620120000_league_foundation.sql`). The single source of sport identity already exists:

- `public.league_sport` enum: `football | soccer | baseball | volleyball | basketball | other`
- `leagues.sport NOT NULL DEFAULT 'football'` — and `create_league(...)` already has a `p_sport` param.
- Every league table stores sport-specific bits **as data** (jsonb `settings`/`options`, birthdate-window divisions), so there are **no football-only columns anywhere** in the league tables.
- `console.ts` already selects + returns `sport`; the dashboard already renders it.

So adding sports is **not a re-architecture**. It's three concrete things: a sport **picker**, **gating** the one football-only workflow, and **per-sport standings**. Everything else already works for any sport, untouched.

## What already works for any sport (zero changes)

Registration · store · divisions (birthdate-window, gender×age) · teams + coaches · rostering · schedule/events · communications · financials. These read no football concept — they operate on generic league data keyed by `league_id`.

## What needs building

**Status (2026-06-30):** Tier 1 ✅ · Tier 2 ✅ · Tier 3 🟡 — terminology shipped; brand wordmark deferred (with branding); adult-participant registration still open. Leo (the league AI) reads `list_standings` and is sport-correct for free.

### Tier 1 — make it real ✅ DONE — non-football leagues work end-to-end except playbooks
1. **Sport picker at creation.** `CreateLeagueForm` gets a sport dropdown → `createLeagueAction` → the RPC's existing `p_sport`. (Today every league silently defaults to football because there's no input.)
2. **Gate the football-only playbook bridge by `league.sport`.** Playbook seeding is inherently football (it copies football example playbooks; the coach product is football). For `sport !== 'football'`, hide: the "Playbooks & drills" tile, the `/playbooks` page (server-side `notFound`), the "Coach view → /playbooks" link, and add a server-action guard in `league-playbooks.ts` (defense-in-depth). Clean rule: **football-only capability, hidden elsewhere** — no non-football play types are ever added.

### Tier 2 — make it correct ✅ DONE (2026-06-30) — the only real per-sport *logic*
3. ✅ **Per-sport standings.** Sport-keyed config in `standings.ts` (`sportStandingsConfig`): soccer ranks by table points (3-1-0) → goal diff; basketball/baseball/volleyball by win %; football unchanged (default). Rows carry `tablePoints` + `winPct`; `setGameScoreAction` rejects a tie for no-tie sports; `StandingsTable` renders Pts / Pct / score-noun columns. Golden tests in `standings.test.ts`. The original target:

   | Sport | Ranking | Ties? | Score noun | Table points |
   |---|---|---|---|---|
   | Football | wins → diff | yes | points (PF/PA) | — |
   | Soccer | table points → goal diff | yes (draws) | goals (GF/GA) | 3 / 1 / 0 |
   | Basketball | win % | no | points | — |
   | Baseball | win % (+ GB) | no | runs | — |
   | Volleyball | match record / set ratio | no | sets | — (needs richer score model) |

   Changes: thread `sport` into `computeStandings(teams, games, config)`; add a `tablePoints` field; switch the sort comparator on `config.rankingRule`; **reject equal scores at write time when `!allowsTies`** (basketball/baseball); make `StandingsTable` render the right columns/labels. Per-sport golden tests (the repo already has `standings.test.ts`). Volleyball alone needs a richer score model (per-set) — defer it.

### Tier 3 — polish 🟡 PARTIAL
4. ✅ **Sport terminology resolver** (`sportTerms()` in `sportConfig.ts`): game↔match↔meet, coach↔manager, score noun — with correct pluralization (match→matches). Threaded through the games surface (page + `GamesAndStandings`), the console, and the teams page (2026-06-30). Remaining: events/registration coach labels.
5. **Brand wordmark on public + operator surfaces.** "Powered by XO Gridmaker" on the public registration page (every parent sees it) reads oddly for a soccer league. Decide: neutral wordmark, or per-league branding (`leagues.branding` jsonb already exists).
6. **Registration applicant shape.** Currently youth-player + guardian. Adult leagues want participant-only — drive "guardian required" off the division age band (`divisionCatalog` already knows `adult`) or a league flag. Minor.

## The one real decision

**How sport-correct do standings need to be for v1?** Generic W-L-T works and ships in Tier 1; sport-correct tables (soccer 3-1-0, basketball win%) are Tier 2. Everything else is gating + labels.

## Non-goals (explicit)
- Do **not** extend `SportVariant` (football play formats) with other sports — that would leak non-football into the coach product. The league `sport` and the football `sport_variant` are different axes and stay separate.
- No changes to the coach product, playbook editor, plays, or formations.

## Migrations
Likely **none** for Tier 1 (sport enum + column + RPC param all exist). Tier 2 standings config is code, not schema. Only a richer volleyball score model would need a migration (deferred).
