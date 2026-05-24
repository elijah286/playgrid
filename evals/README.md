# Coach Cal eval suite (Phase 4)

End-to-end behavioral tests for Coach Cal. Each scenario captures a
coach interaction that previously broke (or that defines important
invariants), and the runner drives the full agent loop to verify Cal
still does the right thing.

## Why this exists

We have unit tests (`*.test.ts`) for the catalog, validator, renderer,
and helpers. Those catch structural regressions. They do NOT catch:

- Cal misinterpreting the prompt (e.g. "show me how defense covers
  this play" → composes new offensive plays instead of compose_defense
  overlay; surfaced 2026-05-24).
- Cal selecting the wrong tool for a coach intent.
- Cal hand-authoring fences when a tool exists (caught by Phase 2b
  structurally, but the eval shows whether Cal even TRIES the right
  path on the first attempt vs after a retry).
- Multi-turn breakage (Cal forgetting context, the auto-save flow
  drifting, etc).

Evals fire the actual chat loop with a scripted coach message, capture
all tool calls + the final reply text, and run assertions against
both.

## Layout

```
evals/
  README.md              # this file
  types.ts               # Scenario + Assertion types
  runner.ts              # the runner (drives runAgent, runs assertions)
  run.ts                 # CLI entry point
  context.ts             # mock ToolContext for hermetic runs
  assertions/
    tools.ts             # toolCalled, toolNotCalled, toolCallCount
    fence.ts             # fenceFor, fenceHasRouteFor, fenceVariant, ...
    prose.ts             # proseContains, proseAvoids (regex matchers)
  scenarios/
    <one .ts file per scenario>
```

## How to run

```sh
# Run all scenarios (uses the real Claude API — costs $$ + tokens):
npx tsx evals/run.ts

# Run one scenario by name fragment:
npx tsx evals/run.ts diamond-crossers

# Run with JSON output (machine-readable):
npx tsx evals/run.ts --json
```

Each run requires `ANTHROPIC_API_KEY` in `.env.local`. Tier 0 scenarios
use real LLM calls.

## Cost notes

Each scenario typically runs 2-5 tool calls + 1-2 chat completions =
roughly **5-15 cents per scenario per run** with Claude Sonnet. The
full suite (~6 scenarios) costs **~$0.50/run**. Run on PRs that touch
`coach-ai/*`, not every PR.

## Adding a scenario

1. Find or write a coach prompt that triggered (or could trigger) the
   bug. Real production logs are ideal.
2. Identify the expected behavior in plain English (which tool, what
   fence properties, what NOT to do).
3. Translate to a `Scenario` (`evals/types.ts`).
4. Drop it in `evals/scenarios/`.
5. Run it: `npx tsx evals/run.ts <your-scenario-name>`.

## What's in scope, what's not

**In scope:**
- One-turn coach prompts that test tool selection + reply shape.
- Multi-turn coach conversations that test memory + the auto-save flow.
- Anti-patterns (Cal must NOT do X).

**Out of scope (vitest covers these):**
- "Skeleton X in variant Y produces a complete fence" — that's a unit
  test on `generateConceptSkeleton`.
- "Validator rejects route Z" — that's a unit test on
  `validateRouteAssignments`.
- "Renderer produces waypoints W for spec S" — that's a unit test on
  `playSpecToCoachDiagram`.
