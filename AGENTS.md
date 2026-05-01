<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## LLM-first data (required)

All play and playbook persistence MUST stay **retrieval- and edit-friendly** for an integrated LLM: canonical typed `PlayDocument` in `play_versions.document`, denormalized truth on `public.plays`, preserved route/formation semantics, deterministic text for future RAG, and command-shaped mutations. Full checklist: `.cursor/rules/llm-first-data.mdc`. Workflow skill: `.cursor/skills/playbook-llm-data/SKILL.md`.

## Git workflow

Work directly on `main`. Commit and push small, focused changes straight to `main` instead of creating long-lived feature branches. Only create a branch when the user explicitly asks for one (e.g. a WIP spike, an experimental refactor the user wants isolated). Do not open pull requests unless asked.

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
