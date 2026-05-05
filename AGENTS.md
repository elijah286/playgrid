<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## LLM-first data (required)

All play and playbook persistence MUST stay **retrieval- and edit-friendly** for an integrated LLM: canonical typed `PlayDocument` in `play_versions.document`, denormalized truth on `public.plays`, preserved route/formation semantics, deterministic text for future RAG, and command-shaped mutations. Full checklist: `.cursor/rules/llm-first-data.mdc`. Workflow skill: `.cursor/skills/playbook-llm-data/SKILL.md`.

## Git workflow

The site has real users. The default workflow optimizes for not breaking production over speed of iteration.

### Branching
- **Major / risky changes**: stage on a branch (the Claude worktree branch is fine), let the user review, push to `main` only after sign-off. Risky = anything that could break or lose user data: auth, DB migrations, payments, write paths, multi-file refactors, build/deploy config, or anything you're not sure about.
- **Small / low-risk fixes**: copy tweaks, isolated CSS, obvious one-file bug fixes, doc edits — push to `main` directly.
- When unsure which bucket a change falls in, ask. Cost of a confirm is low; cost of a bad prod push is high.

### Pre-merge checks
- `npm run typecheck` must pass for every push.
- Tests covering the changed area must pass. New functionality lands with regression tests in the same commit (see Rule 12 below for Coach AI specifics).
- For UI changes that need visual verification, ask before spinning up a local dev server — don't do it speculatively.

### Pull requests
- Don't open PRs unless asked. Branch-and-review happens locally; PR machinery isn't part of this workflow.

## Production safety

### Database migrations
- Never run a migration that DROPs or DELETEs without explicit user confirmation in chat for that specific migration.
- After running a migration, verify the schema change actually landed by querying the affected column / table. `supabase db push` will silently no-op if the version number is already in remote tracking — exit code alone is not proof.
- Prefer additive migrations (add column → backfill → switch reads → drop old) over in-place mutations on tables with user data.

### Secrets
- Never commit env files, API keys, tokens, or credentials. Use `.env.local` locally and Railway env in production.
- If a diff includes a secret, stop and flag it before committing.

### Feature flags
- Risky user-facing changes ship behind a beta gate (existing pattern: Coach AI, Practice Plans). Enable for self first, then expand.

### Rollback
- If a push breaks production, the default move is to revert the breaking commit (`git revert <sha>`) and push the revert. Forward-fix only if the diagnosis is fast and confident.
- DB migrations are not rollback-safe the same way — write a compensating migration; don't try to undo data changes that are already live.

### Post-deploy verification
- After pushing a major change, verify the change actually works in production (Railway URL, Supabase, or whatever surface it touches). "It built" is not "it works."

### Privacy policy
- Any change that adds a sub-processor, tracker, auth provider, or new data collection bumps `src/app/privacy/page.tsx` in the same commit.

## Feature catalog (required)

Whenever you ship a new user-facing feature or capability, add an entry to `src/lib/site/features-catalog.ts` **in the same commit**. This catalog is the source of truth for the Site Admin → Feature list tab and is used for marketing copy, sales conversations, and changelog reference. Bug fixes and internal refactors do NOT need entries — only things a coach, admin, or marketing person could meaningfully describe in a sentence.

## Coach Cal architecture: hard rules

Cal's accuracy stopped being a function of "how much we validate" the moment we shipped the **PlaySpec composition path** (Phases 1–4). The ceiling now is "how disciplined we stay about *where* fixes go." These rules exist so that future bugs and capabilities **route to the framework**, not into one-off patches. Treat them as load-bearing — violating one is the kind of regression that re-creates the patch cadence we just escaped.

### The five layers (where things live)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Catalogs (CODE — single source of truth)                 │
│    src/domain/play/routeTemplates.ts                        │
│    src/domain/play/defensiveAlignments.ts                   │
│    src/domain/play/offensiveSynthesize.ts                   │
│    Module-load assertions; constraints are part of the type.│
├─────────────────────────────────────────────────────────────┤
│ 2. PlaySpec (SEMANTIC — what the play means)                │
│    src/domain/play/spec.ts                                  │
│    Cal composes from named primitives; geometry is derived. │
├─────────────────────────────────────────────────────────────┤
│ 3. Renderer + Parser (DERIVATION — spec ↔ diagram)          │
│    src/domain/play/specRenderer.ts (one-way: spec → diag)   │
│    src/domain/play/specParser.ts   (one-way: diag → spec)   │
├─────────────────────────────────────────────────────────────┤
│ 4. Validators (GATES — at write time)                       │
│    src/lib/coach-ai/route-assignment-validate.ts            │
│    src/lib/coach-ai/notes-lint.ts                           │
│    src/lib/coach-ai/diagram-validate.ts (legacy diagrams)   │
├─────────────────────────────────────────────────────────────┤
│ 5. Projections (DERIVED OUTPUTS — diagrams, prose, KB)      │
│    src/lib/coach-ai/notes-from-spec.ts                      │
│    src/domain/play/catalogKb.ts (Phase 5)                   │
└─────────────────────────────────────────────────────────────┘
```

### Rule 1 — Bug → failing test first

When a coach surfaces a Cal bug, the FIRST commit must contain a **failing test** that reproduces it. The test goes in the layer corresponding to the bug class:

| Bug class | Layer | File pattern |
|---|---|---|
| "Cal drew geometry that doesn't match the family name" | catalog round-trip | `*Templates.test.ts`, `*Alignments.test.ts` |
| "Validator missed an obvious bad input" | validator golden | `*-validate.test.ts` |
| "Spec round-trip lost or mangled meaning" | spec round-trip | `spec.test.ts` |
| "Notes contradict the diagram" | notes-lint golden | `notes-lint.test.ts` |
| "Notes say something the spec doesn't support" | notes-from-spec golden | `notes-from-spec.test.ts` |
| "Cal cited stale or wrong KB content" | KB projector test | `catalogKb.test.ts` (Phase 5) |

If the bug doesn't fit an existing layer, **name the missing layer explicitly** in the commit and create it. Layers don't grow accidentally — they grow on intent.

### Rule 2 — New capabilities go through the spec, not around it

New play behaviors (RPOs, play-action, motions, special teams, double moves) extend `AssignmentAction` in [spec.ts](src/domain/play/spec.ts) with a new `kind` variant. Then:

1. The **renderer** ([specRenderer.ts](src/domain/play/specRenderer.ts)) handles the new kind in its switch.
2. The **parser** ([specParser.ts](src/domain/play/specParser.ts)) classifies inputs into the new kind where appropriate.
3. The **notes projector** ([notes-from-spec.ts](src/lib/coach-ai/notes-from-spec.ts)) emits prose for the new kind.

TypeScript's exhaustive switch-case enforces 1 and 3 mechanically — adding a new `kind` without a renderer + projector branch fails the build. That is the structural enforcement of this rule. Do not add a `default` branch that swallows unknown kinds — the lack of one is what makes it work.

**Anti-pattern**: adding a new write tool that bypasses `PlaySpec` and writes a hand-shaped CoachDiagram directly. If the behavior can be expressed semantically, it must be.

### Rule 3 — Catalog entries update in lockstep

Adding (or modifying) an entry in `routeTemplates.ts` / `defensiveAlignments.ts` REQUIRES, in the same commit:

- The catalog entry itself, with `constraints` populated.
- A coaching cue in `ROUTE_CUES` ([notes-from-spec.ts](src/lib/coach-ai/notes-from-spec.ts)) for routes — so the projection can describe it.
- (After Phase 5) Regeneration of the catalog-derived KB migration via `scripts/build-catalog-kb.ts`.

Round-trip tests cover the entry automatically via `describe.each`. The cue-coverage test ([routeTemplates.test.ts](src/domain/play/routeTemplates.test.ts)) asserts every template has a cue — adding a route without a cue fails CI.

### Rule 4 — All play writes route through the spec resolver

Every write tool that creates or updates a play MUST call `resolveDiagramAndSpec()` ([play-tools.ts](src/lib/coach-ai/play-tools.ts)). The resolver is the only path that runs:

- Render-warning promotion (formation_fallback, defense_unknown, route_template_missing) → hard errors when input was a spec.
- Spec persistence on `metadata.spec`.
- Best-effort spec derivation when input was a legacy diagram.

A write tool that calls `coachDiagramToPlayDocument` directly bypasses the validators and the spec persistence. If you find one, fix it — don't replicate the validations inside the new tool.

### Rule 5 — Make it impossible, then validate; never the other way

When a new failure class is identified, walk this decision tree **in order**:

1. **Can a catalog be extended to make this structurally impossible?** (e.g. "12-yard slant" → constraint on the catalog template). If yes, do that. Stop.
2. **Can the spec shape be tightened to make this impossible?** (e.g. an action kind that requires a depth field). If yes, do that. Stop.
3. **Can the renderer derive the right thing deterministically?** (e.g. defender placement from `place_defense` only, no hand-placement). If yes, do that. Stop.
4. **Only if 1–3 fail**: add a runtime validator. Validators go in `route-assignment-validate.ts`, `notes-lint.ts`, or `diagram-validate.ts`. **Never inline a one-off check inside a tool handler** — that becomes invisible the moment someone refactors the handler.

**Anti-pattern alert**: any sentence in PR review that starts "let me add a regex/check/guard for this specific case" should trigger a pause. If the same sentence could have been "let me extend the catalog" or "let me tighten the spec shape," that's the right move.

### Rule 6 — KB has a single direction of truth

The Knowledge Base is downstream of the catalogs, not parallel:

- **Catalog → KB (one-way generated)**: route geometry, formation structure, defensive scheme placement. The build script ([scripts/build-catalog-kb.ts](scripts/build-catalog-kb.ts)) regenerates these chunks from code. Hand-edited KB content for catalog-derived topics gets overwritten — by design.
- **KB authoritative**: rule books, age-division specifics, league conventions, situational tactics, team-specific terminology. These are coach-authored and not represented in catalogs.
- **Hybrid**: a team's local override of a catalog name (e.g. "we call our Z-In a 'Stick'") is stored in the team KB but NEVER overrides catalog geometry — only nomenclature.

When a catalog and KB chunk disagree about a catalog-derived topic, the catalog is right. The KB regeneration script asserts non-overlap with hand-authored content; conflicts fail the build.

### Rule 7 — Test-driven enforcement of the rules above

Where possible, the rules themselves are tests:

- Rule 2 → TypeScript exhaustive-switch (compile-time)
- Rule 3 → cue-coverage test (CI)
- Rule 4 → no direct calls to `coachDiagramToPlayDocument` outside the resolver and the renderer (grep-able; could be ESLint rule)
- Rule 5 → code review checklist; no automated check yet
- Rule 6 → KB build script asserts non-overlap (Phase 5)

When you're tempted to violate a rule "just this once," check whether the rule is enforced by code or by convention. If by code, you'll fail. If by convention, you're trading a one-day shortcut for a multi-month patch cadence return. Don't.

### Rule 8 — Constructive composition is the only path for catalog concepts

After 2026-05-02 (the "validators alone aren't enough" refactor), there is exactly ONE way to produce a catalog-concept play: `compose_play({ concept, strength?, overrides? })`. The tool wraps `generateConceptSkeleton` + sanitizer + `applyRouteMods` and returns a coach-canonical fence. Cal cannot freelance route geometry for catalog concepts because Cal never authors waypoints — the tool produces the entire fence verbatim.

Do not add a second composition path. If a new requirement appears (RPO concepts, special teams, novel formations), it goes through `compose_play` by extending the catalog + skeleton, NOT by adding a parallel tool. The chat-time validator's concept-skeleton gate enforces this: any catalog-concept claim without `compose_play` (or `get_concept_skeleton`, the legacy alias) on the call stack is rejected at chat-time.

Anti-patterns to refuse:
- A new tool that emits a play fence freehand, bypassing the skeleton.
- A handler that composes the skeleton then re-derives routes via `get_route_template`.
- A "convenience" function that copies the skeleton's path waypoints and tweaks the depth in-place — that's `applyRouteMod`'s job; reimplementing it duplicates the depth-scaling math.

### Rule 9 — Edits are identity-preserving by construction, not by convention

`revise_play` (and any future edit tool) must call `applyRouteMods` from `src/lib/coach-ai/play-mutations.ts`. That function snapshots `players[]` (id, x, y, team) before applying mods and verifies it's unchanged after. A mod that touches positions or IDs returns ok=false — the regression "Why did you flip it?" becomes structurally impossible.

Do not write a new edit tool that mutates `players[]` directly. If a coach asks for something that requires a formation change, that's `compose_play` (with a different formation) or `place_offense` — NOT a revise. The split between revise (route shape) and compose (player layout) is load-bearing.

### Rule 10 — The sanitizer runs at every render boundary

`sanitizeCoachDiagram` in `src/domain/play/sanitize.ts` is the last line of defense before geometry reaches a coach. It runs:
- At the end of `playSpecToCoachDiagram` (renderer output).
- Inside `applyRouteMods` (every edit tool's output).
- Inside `compose_play` and `compose_defense` (every constructive tool's output).
- At the start of the chat-time validator's per-fence loop (catches corrupt fences before lint runs).

When a new code path produces or transforms a `CoachDiagram`, it MUST sanitize. The single hard test for this is the image-3 case (`zone_dropped_oversized`): if a path can produce an oversize zone, the sanitizer must drop it before display. New corruption modes get new sanitizer rules (with stable warning codes) + a regression test in `sanitize.test.ts`.

Anti-patterns to refuse:
- A renderer/converter that returns a `CoachDiagram` without sanitizing.
- A tool that emits a fence to chat without running the sanitizer (`compose_play`, `compose_defense`, `revise_play` all do; new tools must too).
- A hand-coded "this can't happen" check that should have been a sanitizer rule. If a corruption case can hit prod, it goes in the sanitizer with a test.

### Rule 11 — Defenders go through the same shape as offense

Defense composition uses `compose_defense` (unified create/overlay). It produces defenders + zones the same way `compose_play` produces offense + routes:
- The catalog/synthesizer is the source of placement.
- The output is sanitized — zones cannot exceed field bounds; defender positions cannot be NaN.
- When overlaying onto a play, offense is byte-preserved.
- Defender id collisions (two DTs) get suffixed (`DT`, `DT2`) so the diagram-level uniqueness constraint isn't violated.

Single-defender assignment changes go through `set_defender_assignment`. Multi-defender batched edits should be done via repeated `set_defender_assignment` calls — there's no `revise_defense` because defender-assignment edits are heterogeneous (zone, man, blitz, spy, custom path) and each path has its own validation. If a future need surfaces a clear use case for batched defender mods, the symmetric tool goes here.

### Rule 12 — Test plans are mandatory for new functionality

Every new tool, helper, or sanitizer rule lands with regression tests in the same commit. The test files are collocated (`*.test.ts` next to the source). Required coverage:

| Layer | Test pattern | Examples |
|---|---|---|
| Sanitizer rule | one test per warning code; idempotence + purity | `sanitize.test.ts` |
| Composition tool | golden output for the canonical concept; one test per failure mode | `compose-play.test.ts` (when added) |
| Edit tool | identity-preservation across batched mods; one test per rejection case | `play-mutations.test.ts` |
| Validator gate | one positive (passes) + one negative (rejects) test per new gate | `diagram-validate.test.ts` |
| Catalog entry | round-trip + cue coverage (already in `routeTemplates.test.ts`) | `routeTemplates.test.ts` |

When a coach surfaces a regression, the FIRST commit fixing it adds a failing test that reproduces the bug at the right layer (per Rule 1). The fix lands second, with the test going green.

A new feature without tests is not "shipped" — it's "merged but undefended." The next refactor will silently break it, and the next coach who hits the bug will surface it as a regression.

### Architecture in one diagram

```
                 ┌──────────────────────────────────────────┐
                 │    Cal (LLM) emits intent only           │
                 └─────────┬───────────────┬────────────────┘
                           │               │
                           ▼               ▼
              compose_play (offense)   compose_defense
              revise_play (edits)      set_defender_assignment
                           │               │
                           └───────┬───────┘
                                   ▼
                  applyRouteMods  /  computeDefenseAlignment
                                   │
                                   ▼
                   sanitizeCoachDiagram (Rule 10)
                                   │
                                   ▼
                  ```play fence  →  chat-time validator
                                   │
                                   ▼ (validator OK)
                          coach sees the diagram
```

Cal NEVER produces waypoints, defender positions, or zone rectangles directly. Every geometric value originates from a catalog or synthesizer and passes through the sanitizer before display.
