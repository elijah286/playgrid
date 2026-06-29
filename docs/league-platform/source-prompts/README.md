# League-platform source prompts (scope source of truth)

These 8 documents are the **original briefs** that defined the league-operator
expansion of XO Gridmaker. They are the canonical statement of scope, MVP
priorities, and acceptance criteria — when in doubt about whether something is
in scope or "done," **measure against these, not against derived plans.**

| File | Defines |
|---|---|
| `Agent_0_Master_Orchestrator_and_Integration.md` | Shared context, integration, guardrails (protect the coach product) |
| `Agent_1_League_Operator_Console.md` | Operator console / dashboard, roles, league→team→roster |
| `Agent_2_Registration_Payments_and_Commerce.md` | Parent registration, Stripe payments, **merchandise/equipment store** (+ AI catalog) |
| `Agent_3_Communications_and_Notifications.md` | In-app + email comms (SMS = future) |
| `Agent_4_Coach_Curriculum_Playbooks_and_Practice_Plans.md` | League→coach distribution: playbooks **+ practice plans, drills, curriculum** |
| `Agent_5_AI_Assisted_League_Ops.md` | AI: roster recs, comms drafting, catalog population, curriculum, admin assistant |
| `Agent_6_Multi_Sport_Foundation.md` | Multi-sport **foundation** (football first; don't paint into a corner; full per-sport = Future) |
| `Agent_7_Synthesis_MVP_and_Acceptance_Criteria.md` | The MVP definition: priorities, journeys, acceptance criteria, demo script |

**Pilot:** Waco-area football leagues, next spring. Football first; the operator
pays ~$30K/yr for registration software today, so this is meant to be a serious
operating system, not an add-on.

**MVP priorities (Agent 7):** (1) registration & payments, (2) team/coach/roster,
(3) parent & coach communications, (4) distribution of playbooks/practice
plans/drills/resources, (5) league-branded experience, (6) AI assistance.

See [../PLAN.md](../PLAN.md) for the derived implementation plan and
[../MULTI-SPORT.md](../MULTI-SPORT.md) for the multi-sport design. A scope-vs-status
scorecard measured against these prompts is the recommended next artifact.
