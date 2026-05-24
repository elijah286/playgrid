# Football Knowledge Graph — Phase 1 Roadmap

**Status:** Phase 1c in progress (KB seed generator done; legacy file generators reframed as Phase 1d direct-cut) · **Branch:** `feat/football-kg` · **Started:** 2026-05-24

This document is the source of truth for the multi-week Coach Cal architectural refactor. Read it first if you're picking this work up across sessions.

## Why this exists

Audited 2026-05-24 after a session that kept producing patches without resolving root causes. The pattern was: bug surfaces → add a rule/validator → next bug surfaces → repeat. Findings: Cal's knowledge is fragmented across 3 disconnected stores (KB chunks / hardcoded TS catalog / system prompt rules), Cal can sometimes bypass the spec → fence pipeline by hand-authoring, the system prompt has grown past the point where adding rules reliably changes behavior (~3,500 lines), and there's no scenario-level evaluation to catch regressions before coaches do.

**Goal:** make the catalog the single source of truth, make the correct authoring path the only path, and create the foundation for the rest of the phases (spec-only authoring, coach context, evals, sub-agents, catalog expansion).

## The 8-12 week vision

| Phase | Duration | Outcome |
|---|---|---|
| **0 — Stabilize** | done | Stop adding prompt rules; document current state |
| **1 — Knowledge Graph** | 2-3 wk | This phase. Single source of truth for all football primitives. |
| **2 — Spec-Only Authoring** | 2-3 wk | Cal can't emit fences directly; only intent → spec → render. |
| **3 — Coach Context** | 1-2 wk | Profile table, history tracking, personalization. |
| **4 — Eval Suite** | 2-3 wk | 100+ scenarios + LLM judge + CI gate. |
| **5 — Sub-Agents** | 3-4 wk | Split Cal into PlayDesigner / SchemeAnalyst / PracticePlanner / etc. |
| **6 — Catalog Expansion** | ongoing | 50+ new concepts via the KG pipeline. |

Decisions locked 2026-05-24:
- **TypeScript-as-data** for defs initially (YAML migration in Phase 6 if coach-authorship becomes a priority).
- **Worktree branch** with sub-phase merges to main when green.
- **Aggressive prompt cut** in Phase 2 (target ~1,000 lines, down from ~3,500).
- **Beta gate** for the cutover (new Cal opt-in, old Cal stays as fallback during Phases 2-5).

## Phase 1 — sub-phases

### 1a — Schemas + loader + validation (in progress)

**Files to create:**
- `src/domain/football-kg/schemas/types.ts` — shared types (SportVariant, Side, etc.)
- `src/domain/football-kg/schemas/ConceptDef.ts`
- `src/domain/football-kg/schemas/FormationDef.ts`
- `src/domain/football-kg/schemas/RouteDef.ts`
- `src/domain/football-kg/schemas/SchemeDef.ts` — defensive coverage + front
- `src/domain/football-kg/schemas/ReactorPatternDef.ts`
- `src/domain/football-kg/schemas/DrillDef.ts`
- `src/domain/football-kg/load.ts` — index + cross-reference validation
- `src/domain/football-kg/load.test.ts` — schema integrity tests

**Acceptance:** every schema has a canonical example in tests; cross-ref validator catches dangling references (concept points at unknown formation, reactor points at unknown scheme); zod runtime parse passes for the examples.

### 1b — Migrate existing catalog

**Migration order** (smallest blast radius first):
1. **Routes (26)** — ✅ DONE 2026-05-24. All in `defs/routes.ts` as a single typed array (one file, not per-route — simpler in TS-first mode; per-file split is a Phase 6+ YAML migration concern). Schema validation + cross-ref + geometry invariants pass.
2. **Formations (17)** — ✅ DONE 2026-05-24. Decided: hybrid schema. `FormationDef` supports THREE modes (spec / customShape / positions), validator enforces at least one. Migrated: spread, doubles, trips, twins, empty, bunch, stack, pro-i, pro-set, wishbone, t-formation, pistol, singleback, diamond, tight-diamond, i-formation-flag, trips-bunch. Tackle-only formations (Pro I, Pro Set, Wishbone, T-form, Pistol) restrict to tackle_11; flag-context I-Form restricts to flag variants.
3. **Defensive alignments / Schemes (19)** — ✅ DONE. All 19 in `defs/schemes.ts` (T11:7, F7:6, F6:4, F5:2). Renamed `players`→`defenders`, single-variant entries wrapped in `variants[]`. Cross-ref test pins zone-id integrity (every zone-assignment defender references a zone defined on the scheme).
4. **Concepts (20)** — ✅ DONE 2026-05-24. All 20 in `defs/concepts.ts` (11 pass concepts + 6 run/RPO + 1 trick play + Power restricted to tackle_11). Schema redesigned: ConceptDef has matcher pattern (role-based) + optional structural requirements (carry/RPO/ballPath) + optional builder assignments. Capability gates wired (qbRun, rpoRead, handoff, trickPlay, playAction).
5. **Reactor patterns (30)** — ✅ DONE 2026-05-24. 30 of 31 legacy patterns migrated (T11 Cover 0 excluded — empty reactor array + no T11 Cover 0 alignment in catalog; no movement info lost). Patterns reference schemes + concepts by id. Cross-ref validator confirms every schemeId / conceptId resolves; defender ids match the scheme's roster suffix-tolerantly (CB → CB2).

**Phase 1b COMPLETE 2026-05-24.** Total migrated: 113 football primitives (26 routes + 17 formations + 19 schemes + 21 concepts + 30 reactor patterns). 79 tests pass in worktree scope. Single source of truth established.

**File layout (final form):**
- `src/domain/football-kg/defs/routes.ts` ✅ — all 26 routes as a single typed array
- `src/domain/football-kg/defs/formations.ts` ✅ — 17 formations (parametric + custom shapes)
- `src/domain/football-kg/defs/schemes.ts` ✅ — all 19 defensive alignments
- `src/domain/football-kg/defs/concepts.ts` ✅ — 20 concepts (matcher + structural + capability gates)
- `src/domain/football-kg/defs/reactor-patterns.ts` ✅ — 30 patterns (F7: 14, T11: 4, F5: 12)
- `src/domain/football-kg/defs/index.ts` ✅ — assembly point
- `src/domain/football-kg/defs/migration.test.ts` ✅ — schema + cross-ref + per-family coverage

**Acceptance:** all 26+~10+~22+20+~18 entities migrated; round-trip-to-existing-catalog test passes byte-equality. **Routes done; rest is next session's work.**

**Design question resolved 2026-05-24:** `FormationDef` supports three modes (spec / customShape / positions); validator enforces at least one. Most formations use one mode; the schema permits combinations for edge cases.

### 1c — Auto-generators

**Reframed 2026-05-24** after building the first POC. The original plan called for byte-equal generators that reproduce the legacy catalog files (`routeTemplates.ts`, `conceptCatalog.ts`, etc.). After implementing a route-template generator, the better path is:

- **Drop the byte-equal legacy generators.** Reproducing the existing TS files (types + helpers + comments + data) is brittle — any cosmetic change to a helper requires regenerating. Phase 1d cuts tools to import directly from `FOOTBALL_KG` instead, after which the legacy files can be deleted.

- **Ship the KB seed generator instead.** This is genuinely new content (rag_documents rows derived from each primitive's `body`), so byte-equality isn't a concern. The generator wipes existing `source='football-kg'` rows and re-inserts the current KG snapshot. Coach-authored content (`source='seed'`) is preserved.

**Files:**
- `scripts/fb-kg/generate-kb-seed.ts` ✅ — produces SQL migration for `rag_documents` from every primitive's `body`. Idempotent: re-running wipes prior KG rows and re-inserts.
- `src/domain/football-kg/defs/kb-seed-generator.test.ts` ✅ — 11 structural tests verifying every primitive yields a row, variants fan out, SQL escaping handles apostrophes, delete+insert ordering is correct.
- `scripts/fb-kg/validate.ts` — pending (CLI wrapper for `validateKG`).

**Acceptance:** `npx tsx scripts/fb-kg/generate-kb-seed.ts --write` produces a fresh migration. Tests confirm structural validity. Phase 1c COMPLETE on this front.

### 1d — Cut tools to read from KG

**Files modified:**
- `src/lib/coach-ai/tools.ts` — `compose_play`, `place_offense`, `compose_defense`, `get_route_template`, `get_concept_skeleton` import from `football-kg/defs` instead of legacy catalog files
- `src/domain/play/routeTemplates.ts`, `conceptCatalog.ts`, `defensiveAlignments.ts`, `defensiveReactors.ts` — DELETED once nothing imports them (verified by grep + typecheck).
- `src/domain/play/offensiveSynthesize.ts` — refactored to read formation specs from `FOOTBALL_KG.formations` instead of its own parser-based catalog.

**Acceptance:** all existing Cal tests pass; no behavior change visible to coaches. Legacy catalog files gone or stripped to import-only re-exports.

### 1e — Manifest CLI + first scenario evals

**Files:**
- `scripts/fb-kg/list.ts` — `pnpm fb-kg list concepts` / `formations` / etc.
- `scripts/fb-kg/audit.ts` — `pnpm fb-kg audit` reports catalog completeness, missing variants, orphaned refs
- `evals/scenarios/`:
  - `mesh-in-doubles.eval.ts`
  - `diamond-mesh-combination.eval.ts` (today's regression)
  - `four-verticals-flag-5v5.eval.ts` (today's regression)
  - ... 10 total
- `evals/run.ts` — runs scenarios against current Cal, reports pass/fail
- `evals/judge.ts` — LLM-based pass/fail judge (initially can be simple keyword/structure check)

**Acceptance:** `pnpm fb-kg list` and `pnpm fb-kg audit` work; 10 scenarios run + report; framework is ready for Phase 4 to scale to 100+.

## Schema design notes

### Core types (shared across all defs)

```typescript
type FootballPrimitiveBase = {
  id: string;            // stable, kebab-case ("mesh", "diamond")
  name: string;          // display ("Mesh", "Diamond")
  variants: SportVariant[];  // which game types this applies to
  description: string;   // 1-sentence summary
  body: string;          // multi-sentence coaching prose — becomes the KB chunk
  aliases?: string[];    // alternative names ("4 Verts" for Four Verticals)
  complexity?: "basic" | "intermediate" | "advanced";
};
```

### ConceptDef

```typescript
type ConceptDef = FootballPrimitiveBase & {
  family: "concept";
  defaultFormation: { id: string; strength?: "left" | "right" };
  altFormations?: Array<{ id: string; note: string }>;
  assignments: Array<{
    player: string;  // role label ("X", "Y", "Z", "C", "Q", "B", "H", "S", etc.)
    action:
      | { kind: "route"; routeId: string; depthYds?: number; direction?: "left" | "right" }
      | { kind: "block"; target?: "edge" | "interior" }
      | { kind: "run"; gap?: string }
      | { kind: "unspecified" };  // QB drop, etc.
  }>;
  reads?: Array<{
    progression: number;  // 1 = primary
    player: string;
    coverage?: string;    // "vs man", "vs zone"
    window: string;       // "underneath at 4yd", "deep middle", etc.
  }>;
  whenToUse?: string;
  commonMistakes?: string[];
  requiresCapabilities?: string[];  // ["qbRun", "rpoRead"]
};
```

### FormationDef

```typescript
type FormationDef = FootballPrimitiveBase & {
  family: "formation";
  // Player positions per variant — variants share defaults if no override
  positions: {
    default: Record<string, { x: number; y: number; onLine: boolean }>;
    overrides?: Partial<Record<SportVariant, Record<string, { x: number; y: number; onLine: boolean }>>>;
  };
  strength?: "left" | "right";  // default "right"; mirrored for the other side
  tags?: string[];  // ["spread", "compressed", "no-back", "trips"]
};
```

### RouteDef

```typescript
type RouteDef = FootballPrimitiveBase & {
  family: "route";
  waypoints: Array<[number, number]>;  // canonical shape from origin (0, 0)
  depthRange: { min: number; max: number };  // valid finish depth in yards
  curve: boolean;
  breaks?: Array<{ at: [number, number]; direction: string }>;
  coachingPoints?: string[];
};
```

### SchemeDef (defensive)

```typescript
type SchemeDef = FootballPrimitiveBase & {
  family: "scheme";
  front: string;  // "4-3 Over", "5v5 Zone", etc.
  coverage: string;  // "Cover 1", "Tampa 2", etc.
  manCoverage?: boolean;
  defenders: Array<{
    id: string;  // "CB", "FS", "NB", etc. (may be duplicated; renderer suffixes)
    x: number;
    y: number;
    assignment:
      | { kind: "zone"; zoneId: string }
      | { kind: "man"; target?: string }
      | { kind: "blitz"; gap?: string };
  }>;
  zones: Array<{ id: string; kind: "rectangle" | "ellipse"; center: [number, number]; size: [number, number]; label: string }>;
  whenToUse?: string;
  weaknesses?: string[];
};
```

### ReactorPatternDef

```typescript
type ReactorPatternDef = FootballPrimitiveBase & {
  family: "reactor-pattern";
  schemeId: string;  // which scheme this applies to
  conceptId: string;  // which offensive concept it reacts to (or "*" for any)
  reactors: Array<{
    defender: string;  // matches a defender id in the scheme
    trigger: string;  // offensive player id
    behavior: "jump_route" | "carry_vertical" | "follow_to_flat" | "wall_off" | "robber";
    cue: string;  // 1-line coaching cue for prose
  }>;
};
```

### DrillDef (for Phase 5+, but defined now for completeness)

```typescript
type DrillDef = FootballPrimitiveBase & {
  family: "drill";
  focus: string;  // "blocking", "receiving", "QB-mechanics", "defense-flow"
  durationMinutes: number;
  playersNeeded: { min: number; max: number };
  equipment: string[];
  procedure: string;  // step-by-step instructions
  variations?: Array<{ name: string; description: string }>;
  ageRange?: { min: number; max: number };
};
```

## Cross-reference validation

The validator (`load.ts`) checks at load time:
- Every concept's `defaultFormation.id` exists in formations
- Every concept's `altFormations[].id` exists
- Every concept's `assignments[].action.routeId` exists in routes
- Every reactor pattern's `schemeId` exists in schemes
- Every reactor pattern's `conceptId` exists in concepts (or is "*")
- Every concept's `requiresCapabilities` matches known capability flags

Returns aggregated errors; tests assert no errors on the migrated catalog.

## Open questions to revisit

- **Per-variant overrides for routes**: do route waypoints differ by variant (5v5 vs 11v11 field size)? Probably yes — needs schema accommodation.
- **Versioning of defs**: as concepts evolve, do we keep history? Initial answer: git history is enough; don't over-engineer.
- **Concept families beyond "passing-concept"**: run concepts, RPO concepts, screen concepts, trick plays. Decide on family taxonomy in 1a.

## Tracking progress

Sub-phase status lives in this doc's frontmatter (`Status:` at top). Update it on each sub-phase completion + merge to main.
