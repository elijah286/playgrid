# Football Knowledge Graph

The single source of truth for every football primitive Coach Cal knows about.

**See `docs/football-kg-roadmap.md` for the full Phase 1 plan and design decisions.**

## Architecture

```
src/domain/football-kg/
├── README.md               # this file
├── schemas/                # type definitions + zod validation
│   ├── types.ts            # shared (PlayerRole, Side, SportVariant re-export)
│   ├── base.ts             # FootballPrimitiveBase
│   ├── ConceptDef.ts
│   ├── FormationDef.ts
│   ├── RouteDef.ts
│   ├── SchemeDef.ts        # defensive coverage + front
│   ├── ReactorPatternDef.ts
│   └── DrillDef.ts
├── load.ts                 # entry point: typed access to all defs
├── load.test.ts            # schema-integrity tests
└── defs/                   # the actual catalog data (TS-as-data)
    ├── routes/
    ├── formations/
    ├── schemes/
    ├── concepts/
    ├── reactor-patterns/
    └── drills/
```

## Adding a new football primitive

1. Define it in the appropriate `defs/<family>/<id>.ts` file.
2. Run `pnpm vitest run src/domain/football-kg` — cross-ref validator fires automatically.
3. Run `pnpm fb-kg audit` to confirm catalog completeness.
4. Run `pnpm fb-kg generate` to regenerate the legacy catalog files (auto-derived, do not hand-edit them).

The legacy catalog files (`conceptCatalog.ts`, `routeTemplates.ts`, `offensiveSynthesize.ts`, `defensiveAlignments.ts`, `defensiveReactors.ts`) are AUTO-GENERATED from this KG during Phase 1c. Do not edit them by hand once the migration is complete.

## Why TS-as-data instead of YAML

- TypeScript catches schema errors at write time (no separate parser, no YAML indentation errors).
- IDE autocomplete works on definition fields without extra tooling.
- Zod runtime validation gives us defense-in-depth (catches mutations and stale code).
- YAML migration is a Phase 6 optional (if coach-authorship becomes a priority).

## Cross-reference invariants enforced by `load.ts`

- Every concept's `defaultFormation.id` resolves to a real formation.
- Every concept's `altFormations[].id` resolves.
- Every assignment's `action.routeId` resolves (for kind: "route" actions).
- Every reactor pattern's `schemeId` and `conceptId` resolve (conceptId can be "*").
- Every concept's `requiresCapabilities` matches known capability flags from `playbookSettings`.
- Every reactor pattern's `reactors[].defender` exists in the referenced scheme's `defenders[]`.

Validator returns aggregated errors; tests assert zero errors on the migrated catalog.
