# League platform — scope vs. status scorecard

Measured against the 8 source briefs in [`source-prompts/`](source-prompts/) — the
canonical scope, **not** derived plans. Status as of 2026-06-22.

**Headline:** the *operational spine* (register → roster → teams → schedule →
standings → financials) is built and shipped. But **3 of the 6 MVP priorities
(Agent 7) are largely open** — communications depth, coaching resources beyond
playbooks, branding, and all of AI. Honest completion of the **defined MVP ≈
half**. Some effort also went to things that weren't on the MVP priority list
(games/standings, financials) while priority items (branding, AI) sat untouched.

Legend: ✅ done · 🟡 partial · ❌ not built

## Against Agent 7's MVP priorities

| # | MVP priority | Status | What's missing |
|---|---|---|---|
| 1 | Registration & payments (Agent 2) | 🟡 mostly | payments **dormant** (Connect off); store is basic (no photo/size/color/applicability); no waivers/acknowledgments; no AI catalog |
| 2 | Team / coach / roster (Agent 1) | 🟡 mostly | coach **accounts + lifecycle** (invited/active/removed) — today coaches are just name/email text; **season** management; team draft/active/archived states |
| 3 | Parent & coach communications (Agent 3) | 🟡 ~40% | **in-app notifications**; targeting beyond "coaches" (league/division/team/parents/unrostered); message types (weather/reschedule/etc.); preview; per-recipient delivery status; AI drafting |
| 4 | Distribution of playbooks **+ practice plans, drills, curriculum** (Agent 4) | 🟡 ~30% | **practice plans, drills, skill progressions, curriculum, teaching notes** (only playbook seeding is built); visual drill diagrams |
| 5 | **League-branded experience** (Agent 1/0) | ❌ ~5% | league **logo/colors** on console + public registration; "Powered by XO Gridmaker" still shows to parents; the "Branding" tile is a "Soon" placeholder |
| 6 | **AI assistance** (Agent 5) | ❌ 0% | roster recommendations · comms drafting · store-catalog population · curriculum drafting · admin assistant ("who's not rostered?") |
| — | Multi-sport **foundation** (Agent 6) | ✅ MVP bar met | sport-agnostic schema + picker + gating. Full per-sport behavior (soccer tables, drills) is explicitly **post-MVP** in the brief |

## Built but not an explicit MVP priority
- **Games & standings** ✅ (generic W-L-T) — useful, but not on Agent 7's list; sport-correct standings deferred.
- **Financials** ✅ — fits Agent 1's "basic reporting/visibility."

## Cross-cutting (Agent 0 product scope)
| Area | Status |
|---|---|
| Coach product protected / additive / gated | ✅ (verified untouched every increment) |
| Parent: registration link/QR, flow, payment, merch | ✅ / 🟡 (payment dormant, merch basic) |
| Parent: **team-assignment visibility, notifications** | ❌ |
| Coach: receives league playbook | ✅ (copy link); team/roster view + coach→parent comms ❌ |
| Operational-gap surfacing | 🟡 (unrostered ✅, teams-without-coach ✅; uneven divisions / incomplete registrations / failed comms ❌) |

## Process gap
- The **Agent 7 deliverable itself** (MVP execution doc: journeys, acceptance criteria, demo script, risk register, build order) was never produced. `PLAN.md` is a derived plan, not that.

## Honest read on the biggest gaps (priority order)
1. **AI assistance (MVP #6)** — 0% built, and it layers directly onto what exists (roster recs on rostering, comms drafting on broadcasts, catalog AI on the store). Highest leverage; the brief treats it as core, not future.
2. **League branding (MVP #5)** — small, high parent-facing impact; explicitly "parents should feel they're in *their* league."
3. **Communications depth (MVP #3)** — in-app + real targeting + message types.
4. **Practice plans / drills / curriculum (MVP #4)** — the harder content build.
5. Richer commerce (variants/photos), waivers, seasons, coach accounts, parent post-reg experience.
