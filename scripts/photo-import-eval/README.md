# Photo-import extraction eval (Phase 0)

The go/no-go gate for "Coach Cal imports a play from a photo." A vision model reads each play panel of a photographed sheet into a **coordinate-free semantic schema** (route family + depth + direction + confidence — never waypoints), and this harness scores it against human-verified goldens. No product code ships until the ship bar below is met.

Why this design (the 2026-05 pipeline's post-mortem, inverted):

- **Semantics, not geometry.** The old pipeline had Opus emit raw `CoachDiagram` waypoint fences and misread ~30% of hand-drawn routes. Here the model answers a classification question over the same route catalog the renderer draws from ([schema.ts](schema.ts) has no coordinate fields at all — AGENTS.md Rule 5 at the extraction boundary).
- **Catalog lockstep.** The prompt's route vocabulary and the tool schema's `family` enum are generated from `ROUTE_TEMPLATES` at call time; the scorer resolves aliases through the same `findTemplate()` the renderer uses.
- **Calibration is a first-class metric.** A miss the model flags `med`/`low` becomes a review-UI moment in the product; a confident miss becomes a wrong play in a coach's playbook. The report measures the flagged-miss rate directly.

## Setup

- A JPG/PNG export of the sheet photo (not HEIC — `File → Export` from Photos).
- `ANTHROPIC_API_KEY` in the environment (the eval calls the API directly; it does not use the app's stored key).
- Goldens verified — see [GOLDENS-REVIEW.md](GOLDENS-REVIEW.md). Until plays are flipped to `"verified": true`, the report brands all numbers provisional.

## Commands

```bash
# 1. Crop only — verify grid geometry before spending API calls
npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --dry

# 2. Iterate on a subset
npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --plays 1,3,8

# 3. Full run on a model
npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --model claude-opus-4-8
npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --model claude-fable-5
npx tsx scripts/photo-import-eval/run.ts --image ~/Desktop/bomb-squad-p1.jpg --model claude-sonnet-5

# 4. Re-score a saved run after editing goldens (no API calls)
npx tsx scripts/photo-import-eval/run.ts --score-only scripts/photo-import-eval/runs/<dir>
```

Each run writes `runs/<model>-<timestamp>/` with `crops/` (the panels sent to the model), `extractions/` (validated readings), `raw/` (full API responses), `report.md`, and `summary.json` (includes exact token usage and dollar cost). Runs are sequential so the cached system prompt is reused across panels.

If `--dry` shows clipped panels, tune `--region top,bottom,left,right` (photo fractions; default matches the Bomb Squad photo) and `--margin`.

## Metrics and ship bar

| Metric | Printed sheets | Neat hand-drawn |
|---|---|---|
| Route-family accuracy (with accepted alternates) | ≥ 90% | ≥ 75% |
| Flagged-miss rate (family misses marked med/low) | ≥ 95% | ≥ 90% |
| Depth MAE | ≤ 3 yd | ≤ 4 yd |
| Formation accuracy | ≥ 85% | ≥ 70% |

Rationale: with the review-UI product frame (side-by-side photo vs render, confirm before save), accuracy at that level means a coach fixes at most one route per play, and the UI pre-highlights the ones to check. Failing the bar cheaply here — rather than in beta, like last time — is the point of Phase 0.

## Relationship to the shipped feature (Phase 1)

The product pipeline lives in `src/lib/coach-ai/photo-import/` (this eval imports the same `schema.ts` + `prompt.ts`, so prompt/schema improvements measured here ship automatically): extraction → `synthesize.ts` → `PlaySpec` → the existing resolver → renderer → sanitizer path, fronted by `/api/photo-import/*` and the review UI at `/playbooks/[id]/import-photo`, behind the `photo_play_import` beta flag with the `coach-cal-image-cap` meter.

This harness stays the accuracy gate: run it before widening the beta or changing the extraction model/prompt, and re-run `--score-only` after golden edits.
