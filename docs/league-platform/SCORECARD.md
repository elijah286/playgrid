# League platform — scope vs. status scorecard

Measured against the 8 source briefs in [`source-prompts/`](source-prompts/) — the
canonical scope, **not** derived plans. Status as of **2026-06-30**.

**Headline:** the picture has flipped since the 2026-06-22 read. Back then the
*operational spine* (register → roster → teams → schedule → standings → financials)
was built but the **AI priority (MVP #6) sat at 0%** and was the single biggest gap.
Since then the **AI assistant ("Leo") has been built out across the whole operator
surface** and is now the *most* complete of the once-open priorities. Communications
and practice-plan distribution also advanced materially. The defined MVP is now well
past half. The remaining open work is **coach accounts/lifecycle, payments activation
+ richer commerce, branding (deferred by request), and communications depth (in-app
notifications)**.

Legend: ✅ done · 🟡 partial · ❌ not built · ⏸ deferred by request

## Against Agent 7's MVP priorities

| # | MVP priority | Status | What's left |
|---|---|---|---|
| 1 | Registration & payments (Agent 2) | 🟡 mostly | payments **dormant** (Connect off); store basic (no photo/variant/applicability, no AI catalog); no waivers. **+ sport-driven registration fields shipped.** |
| 2 | Team / coach / roster (Agent 1) | 🟡 mostly | coach **accounts + lifecycle** still name/email text (the foundational gap); **season** management; team draft/active/archived states. Roster ops themselves now also drivable by Leo. |
| 3 | Parent & coach communications (Agent 3) | 🟡 ~70% | **+ audience targeting, preview-to-self, league groups + cross-league broadcast, AI drafting (Leo) shipped.** Left: **in-app notifications**, message types (weather/reschedule), per-recipient delivery status. |
| 4 | Distribution of playbooks **+ practice plans, drills, curriculum** (Agent 4) | 🟡 ~55% | **+ curriculum distribution shipped** (operator builds a practice plan → one-click share into every team's playbook; Leo can do it too). Left: **drills library**, skill progressions, coach-facing "browse league curriculum," multi-sport. |
| 5 | **League-branded experience** (Agent 1/0) | ⏸ ~5% | **Deferred by request.** league logo/colors on console + public registration; remove "Powered by XO Gridmaker" for parents. |
| 6 | **AI assistance** (Agent 5) | 🟡 ~75% (gated, dark) | **Leo shipped:** admin assistant (league state, who's-not-rostered), registration triage, team/coach management, **roster placement**, comms drafting **+ send**, curriculum **draft + distribute** — all read-inline / **write-by-approval**. Left: store-catalog AI; Leo polish (streaming, chat persistence, cost caps). Ships behind `LEAGUE_AI_ENABLED` / `LEAGUE_AI_WRITES` (both off). |
| — | Multi-sport **foundation** (Agent 6) | ✅ MVP bar met | sport-agnostic schema + picker + gating; sport-driven registration fields. Full per-sport behavior (soccer tables, drills) remains post-MVP. |

## Leo (MVP #6) — capability detail

Read (no approval): league overview · registrations by status · unrostered players ·
teams + coach status · announcement audiences · league groups · settings · curriculum
plans. Write (propose → operator approves): set registration status · place players on
teams · create teams · assign coaches · distribute practice plan · send announcement ·
send group announcement · rename league · set registration link. Architecture +
staged-flag rollout recorded in agent memory (`leo-league-assistant`).

## Built but not an explicit MVP priority
- **Games & standings** ✅ (generic W-L-T); sport-correct standings deferred.
- **Financials** ✅ — fits Agent 1's "basic reporting/visibility."
- **Per-league settings** ✅ — rename, custom registration-link slug, delete.

## Honest read on the biggest *remaining* gaps (priority order)
1. **Coach accounts + lifecycle (MVP #2)** — coaches are still name/email text, not
   accounts. This is the foundational gap: it blocks coach login, team/roster views,
   and coach→parent comms. Highest-leverage next foundation.
2. **Payments activation + richer commerce (MVP #1)** — Stripe Connect is built but
   dormant; the store lacks variants/photos. Activating payments is real revenue.
3. **Communications depth (MVP #3)** — in-app notifications, message types, delivery
   status. (Targeting, preview, groups, AI drafting now done.)
4. **Practice plans depth (MVP #4)** — drills library + coach-facing browse.
5. **Branding (MVP #5)** — ⏸ deferred by request; small, high parent-facing impact
   when picked back up.
6. **Leo polish + enablement** — streaming/persistence/cost-caps, then flip the flags
   to enable for operators (read-only first, then writes).

## Process gap (unchanged)
- The **Agent 7 deliverable** (MVP execution doc: journeys, acceptance criteria, demo
  script, risk register, build order) was never produced as such.
