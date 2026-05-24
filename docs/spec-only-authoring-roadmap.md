# Phase 2 — Spec-Only Authoring

**Status:** Phase 2a in progress · **Branch:** `feat/spec-only-authoring` · **Started:** 2026-05-24

This is the direct structural fix for the bug class we kept patching through May 2026: **Cal hand-authoring fence geometry, producing wrong formations / wrong route depths / prose-route mismatches.** Phase 1's KG made the data layer correct; Phase 2 makes the AUTHORING path structurally safe.

## The core principle

**Cal can only emit intent. The harness produces geometry.**

Today:
```
Cal LLM → emits ```play fence (CoachDiagram JSON with players[] + routes[]) → coach sees it
            ↑
            Cal sometimes hand-authors this, producing wrong coords.
            Validators catch some, but Cal recovers poorly on retry.
```

After Phase 2:
```
Cal LLM → emits ```spec fence (PlaySpec JSON: formation + assignments) → renderer → ```play fence → coach sees it
            ↑                                                              ↑
            Pure intent. No coordinates.                                   Deterministic. Cal can't influence.
```

Cal CANNOT produce wrong coordinates because Cal NEVER WRITES coordinates. It names the formation (which the KG knows the positions for) and per-player route families + depths (which the catalog scales correctly per variant). The renderer turns the spec into a fence; Cal never sees the fence until the coach does.

## Why this works where prompt rules + validators didn't

Validators catch broken output AFTER the fact. Each new bug led to a new validator gate; Cal's retry critique grew; the prompt grew. The system optimized for catching mistakes, not preventing them.

Spec-only authoring eliminates the freedom that produced the mistakes. Cal can't put @Y at the wrong position because Cal doesn't write `{id: "Y", x: 4, y: -5}`. Cal writes `{formation: "diamond"}` and the renderer places @Y based on the Diamond catalog entry.

The system prompt also shrinks dramatically. Today ~3,500 lines, half of which is "how to author a fence correctly" — coordinate conventions, label conventions, OL row constraints, etc. With Cal authoring specs not fences, all that goes away.

## Sub-phases

### 2a — Plumb spec output through compose tools (3-4 days)

Currently compose_play returns BOTH a fence and a spec (the spec is fed to create_play for persistence). Phase 2a makes the spec the *primary* output: Cal copies the SPEC into chat, not the fence.

**Deliverables:**
- `src/lib/coach-ai/agent.ts`: detect `\`\`\`spec` fences in Cal's reply alongside `\`\`\`play`. When a spec block appears, render it server-side to a play fence and replace the spec block in the streamed output.
- Spec rendering helper that's a thin wrapper around `playSpecToCoachDiagram` from `src/domain/play/specRenderer.ts`.
- Tests: a spec → fence round-trip for each catalog concept, asserting the rendered fence is byte-equal to what compose_play would have returned.
- compose_play prompt + tool description updated: "Drop the SPEC into your reply between \`\`\`spec and \`\`\`. The harness renders it to a play fence at display time."

**Acceptance:** Cal copies `\`\`\`spec`; coach sees `\`\`\`play`; existing behavior unchanged for the canonical concepts.

### 2b — Reject hand-authored play fences (2-3 days)

The harness MUST reject any `\`\`\`play` fence that didn't come from rendering a `\`\`\`spec` or from a fence-producing tool call (compose_defense without on_play, place_offense returning a fence). The "Cal authors a fence by typing JSON" path becomes structurally impossible.

**Deliverables:**
- `src/lib/coach-ai/diagram-validate.ts`: new gate `validatePlayFenceProvenance`. Tracks the set of tool-emitted fence snapshots + spec-rendered fences this turn. Any `\`\`\`play` fence in Cal's reply MUST be a member.
- Critique on rejection: "Hand-authored play fences are forbidden. Emit a `\`\`\`spec` block instead — the harness will render it."
- Tests: positive (tool-emitted fence passes), negative (Cal-authored fence rejected).

**Acceptance:** Cal can ONLY produce fences via tool calls or spec emission. The hand-author hole is closed structurally.

### 2c — Shrink the system prompt (2-3 days)

With spec-only authoring in place, large sections of the prompt that teach "how to author a fence correctly" become obsolete. The prompt should shrink from ~3,500 lines to ~1,500-2,000.

**Sections to remove or compress:**
- Coordinate system explanations (Cal no longer writes coords).
- Player label conventions per variant (Cal references roles in specs, not ids in fences).
- "Don't author the OL row" / "Don't hand-author named routes" / etc. — Cal can't author fences at all.
- Surgical-edit fence-preservation rules (Cal edits via revise_play, which already operates on specs internally).
- Most of the "if validation fails, do X" critique guidance (the spec validator is much simpler).

**What stays:**
- Tool selection rules (when to use compose_play vs revise_play vs compose_defense).
- Conversational style (TL;DR-first, @-tokens, plain English).
- Anti-patterns about tool naming, false success claims, prose accuracy.
- Football knowledge / coaching philosophy (this is what Cal IS for).

**Deliverables:**
- Rewritten `NORMAL_PROMPT` in agent.ts (target: 1,500-2,000 lines).
- Side-by-side diff + word-count comparison.
- Regression tests on common scenarios (Mesh, Smash, etc.) confirm no behavior change.

**Acceptance:** Prompt is 40-50% smaller. Cal behavior on the test scenarios unchanged.

### 2d — Beta gate + cutover (2-3 days)

**Reframed during build (2026-05-24):** The original per-coach beta-flag plan turned out to be moot. Phase 2b's gate is harness-level (every reply Cal emits goes through it) and Phase 2c's prompt update is global — there's no "spec mode vs legacy mode" toggle to expose. Every coach is on the new path the moment 2b+2c merge.

What 2d became instead: **observability + kill switch.** Goals:

- **Observability** — log every provenance-gate fire so we can measure how often Cal authors hand-typed fences in production. Even when enforcement is off, the log fires. Lets us tune the prompt / catalog if Cal can't reliably emit specs.
- **Kill switch** — env-var override that disables enforcement (but keeps logging) so the user can yank the gate in seconds if it misbehaves in prod. No code revert needed.

**Deliverables:**
- `agent.ts`: every `validateFenceProvenance` failure logs a structured `[coach-ai:provenance]` line with fire/bypass flag, hand-authored count, approved-fingerprint count, attempt number, and a 140-char sample of the failing fence body.
- `COACH_CAL_PROVENANCE_GATE=off` env var disables enforcement (retry and final-strip both skip; the bad fence ships as-is — legacy behavior). Default: enforcement ON.
- Doc updates: this roadmap reflects what shipped; `AGENTS.md` mentions the kill switch + log format so the user knows how to read Cloud Run logs and how to flip the switch.

**Acceptance:** Provenance failures are visible in production logs; flipping the env var on Cloud Run instantly disables enforcement without a code deploy.

## Risks + mitigations

- **Spec rendering produces a different fence than what Cal would have authored.** Mitigated by Phase 1's byte-equality verification — the renderer already produces the canonical fence. Round-trip tests in 2a confirm this per-concept.
- **Cal struggles to author specs without coordinate intuition.** The spec is FAR simpler than a fence (formation name + assignments by role). Tests with sample specs will confirm Cal can produce them reliably.
- **Some plays don't fit the spec model.** Edge cases (image waypoint mode for hand-drawn plays, custom freehand layouts) need a "fall back to fence authoring" escape hatch. Decision in 2a: spec mode is preferred; fence mode stays available behind a "this is a freehand layout" toggle.
- **Beta-flag complexity.** Two code paths to maintain temporarily. Keep the migration window short (≤4 weeks) to avoid permanent fork.

## What this unlocks for Phase 3+

- **Phase 3** (coach context) — specs are easier to personalize than fences. "This coach prefers RPO concepts" → bias the compose_play default. Coordinate-level personalization is impractical.
- **Phase 4** (eval suite) — spec equivalence is well-defined; fence byte-equality has too many degrees of freedom (whitespace, ordering). Evals compare specs and the comparison is meaningful.
- **Phase 5** (sub-agents) — each sub-agent emits specs in its narrow domain (PlayDesigner emits play specs, PracticePlanner emits drill specs, etc.). Specs are the common interchange format.
- **Phase 6** (catalog expansion) — adding a new concept means adding a KG entry + a skeleton builder. No need to also write "how should Cal author a fence for this concept" prompt rules; the renderer handles it.

## Tracking progress

Sub-phase status lives in this doc's frontmatter. Update on each completion + merge.
