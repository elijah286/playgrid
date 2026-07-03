/**
 * Scoring for the photo-import eval.
 *
 * Four metrics decide the Phase 0 go/no-go (see README):
 *   1. Route-family accuracy (exact + with-alternates)
 *   2. Depth MAE + within-tolerance rate
 *   3. Formation match rate
 *   4. Confidence calibration — of the family MISSES, how many did the
 *      model flag med/low? A flagged miss becomes a review-UI moment; a
 *      confident miss becomes a wrong play in a coach's playbook.
 *
 * Family names are resolved through findTemplate() so aliases ("Vert"
 * vs "Go") never count as misses — the same resolution the renderer
 * itself performs.
 */

import { findTemplate } from "@/domain/play/routeTemplates";
import type { ExtractedAssignment, PlayExtraction, ExtractionConfidence } from "./schema";
import type { GoldenAssignment, GoldenPlay } from "./goldens";

export const DEFAULT_DEPTH_TOL_YDS = 3;

export function resolveFamily(name: string | undefined | null): string | null {
  if (!name) return null;
  const t = findTemplate(name);
  if (t) return t.name;
  return name.trim().toLowerCase();
}

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type AssignmentScore = {
  player: string;
  /** The model produced an assignment for this player at all. */
  present: boolean;
  kindOk: boolean;
  familyExpected: string | null;
  familyGot: string | null;
  /** Matched the golden family exactly (after alias resolution). */
  familyOk: boolean;
  /** Matched the golden family OR one of its accepted alternates. */
  familyAltOk: boolean;
  depthExpected: number | null;
  depthGot: number | null;
  depthDelta: number | null;
  depthOk: boolean | null;
  /** null when the golden doesn't pin a direction. */
  directionOk: boolean | null;
  confidence: ExtractionConfidence | null;
};

export function scoreAssignment(golden: GoldenAssignment, got: ExtractedAssignment | undefined): AssignmentScore {
  const familyExpected = resolveFamily(golden.family);
  const familyGot = resolveFamily(got?.family);
  const alternates = (golden.alternates ?? []).map((a) => resolveFamily(a));

  const isRouteComparison = golden.kind === "route" && got?.kind === "route";
  const familyOk = isRouteComparison && familyExpected !== null && familyGot === familyExpected;
  const familyAltOk = familyOk || (isRouteComparison && familyGot !== null && alternates.includes(familyGot));

  let depthDelta: number | null = null;
  let depthOk: boolean | null = null;
  if (isRouteComparison && golden.depthYds != null && got?.depthYds != null) {
    depthDelta = Math.abs(got.depthYds - golden.depthYds);
    depthOk = depthDelta <= (golden.depthTolYds ?? DEFAULT_DEPTH_TOL_YDS);
  }

  let directionOk: boolean | null = null;
  if (isRouteComparison && golden.direction) {
    directionOk = got?.direction === golden.direction;
  }

  return {
    player: golden.player,
    present: got !== undefined,
    kindOk: got !== undefined && got.kind === golden.kind,
    familyExpected,
    familyGot,
    familyOk,
    familyAltOk,
    depthExpected: golden.depthYds ?? null,
    depthGot: got?.depthYds ?? null,
    depthDelta,
    depthOk,
    directionOk,
    confidence: got?.confidence ?? null,
  };
}

export type PlayScore = {
  index: number;
  verified: boolean;
  /** Null when the extraction call failed entirely (refusal, repeated
   *  invalid output) — every golden assignment counts as a miss. */
  extracted: boolean;
  formationExpected: string;
  formationGot: string | null;
  formationOk: boolean;
  assignments: AssignmentScore[];
};

export function scorePlay(golden: GoldenPlay, extraction: PlayExtraction | null): PlayScore {
  const byPlayer = new Map<string, ExtractedAssignment>();
  for (const a of extraction?.assignments ?? []) {
    const key = a.player.trim().toUpperCase();
    // First assignment per player wins; duplicates are a model error that
    // shows up as the duplicate's target being scored against nothing.
    if (!byPlayer.has(key)) byPlayer.set(key, a);
  }

  const formationGot = extraction?.formation.name ?? null;
  const accepted = [golden.formation.name, ...(golden.formation.alternates ?? [])].map(normalizeLoose);
  const formationOk = formationGot !== null && accepted.includes(normalizeLoose(formationGot));

  return {
    index: golden.index,
    verified: golden.verified,
    extracted: extraction !== null,
    formationExpected: golden.formation.name,
    formationGot,
    formationOk,
    assignments: golden.assignments.map((g) => scoreAssignment(g, byPlayer.get(g.player.trim().toUpperCase()))),
  };
}

export type CalibrationBucket = { n: number; familyAltOk: number };

export type Aggregate = {
  plays: number;
  verifiedPlays: number;
  extractedPlays: number;
  assignments: number;
  kindAcc: number;
  familyAcc: number;
  familyAltAcc: number;
  depthComparisons: number;
  depthMaeYds: number | null;
  depthWithinTol: number;
  directionComparisons: number;
  directionAcc: number;
  formationAcc: number;
  /** Per extraction-confidence bucket, over route-family comparisons. */
  calibration: Record<ExtractionConfidence | "missing", CalibrationBucket>;
  /** Of the family misses, fraction the model flagged med/low. This is
   *  the "flagged miss" rate — the ship-bar calibration number. */
  missesFlagged: { misses: number; flagged: number };
};

function rate(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

export function aggregate(scores: PlayScore[]): Aggregate {
  const assignments = scores.flatMap((s) => s.assignments);
  const routeComparisons = assignments.filter((a) => a.familyExpected !== null);
  const depthed = assignments.filter((a) => a.depthDelta !== null);
  const directioned = assignments.filter((a) => a.directionOk !== null);

  const calibration: Aggregate["calibration"] = {
    high: { n: 0, familyAltOk: 0 },
    med: { n: 0, familyAltOk: 0 },
    low: { n: 0, familyAltOk: 0 },
    missing: { n: 0, familyAltOk: 0 },
  };
  let misses = 0;
  let flaggedMisses = 0;
  for (const a of routeComparisons) {
    const bucket = a.confidence ?? "missing";
    calibration[bucket].n += 1;
    if (a.familyAltOk) calibration[bucket].familyAltOk += 1;
    else {
      misses += 1;
      if (a.confidence === "med" || a.confidence === "low") flaggedMisses += 1;
    }
  }

  return {
    plays: scores.length,
    verifiedPlays: scores.filter((s) => s.verified).length,
    extractedPlays: scores.filter((s) => s.extracted).length,
    assignments: assignments.length,
    kindAcc: rate(assignments.filter((a) => a.kindOk).length, assignments.length),
    familyAcc: rate(routeComparisons.filter((a) => a.familyOk).length, routeComparisons.length),
    familyAltAcc: rate(routeComparisons.filter((a) => a.familyAltOk).length, routeComparisons.length),
    depthComparisons: depthed.length,
    depthMaeYds: depthed.length === 0 ? null : depthed.reduce((s, a) => s + (a.depthDelta ?? 0), 0) / depthed.length,
    depthWithinTol: rate(depthed.filter((a) => a.depthOk).length, depthed.length),
    directionComparisons: directioned.length,
    directionAcc: rate(directioned.filter((a) => a.directionOk).length, directioned.length),
    formationAcc: rate(scores.filter((s) => s.formationOk).length, scores.length),
    calibration,
    missesFlagged: { misses, flagged: flaggedMisses },
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function aggregateSection(title: string, agg: Aggregate): string {
  const lines: string[] = [];
  lines.push(`### ${title}`);
  lines.push("");
  lines.push(`- Plays scored: ${agg.plays} (${agg.extractedPlays} extracted OK)`);
  lines.push(`- Assignment kind accuracy: ${pct(agg.kindAcc)} of ${agg.assignments}`);
  lines.push(`- Route family accuracy: ${pct(agg.familyAcc)} exact, ${pct(agg.familyAltAcc)} with accepted alternates`);
  lines.push(
    agg.depthMaeYds === null
      ? "- Depth: no comparisons"
      : `- Depth: MAE ${agg.depthMaeYds.toFixed(1)} yd, ${pct(agg.depthWithinTol)} within tolerance (${agg.depthComparisons} comparisons)`,
  );
  lines.push(`- Direction accuracy: ${pct(agg.directionAcc)} (${agg.directionComparisons} comparisons)`);
  lines.push(`- Formation accuracy: ${pct(agg.formationAcc)}`);
  const mf = agg.missesFlagged;
  lines.push(
    mf.misses === 0
      ? "- Calibration: no family misses"
      : `- Calibration: ${mf.flagged}/${mf.misses} family misses were flagged med/low (${pct(rate(mf.flagged, mf.misses))} flagged-miss rate)`,
  );
  lines.push("");
  lines.push("| confidence | n | family ok |");
  lines.push("|---|---|---|");
  for (const bucket of ["high", "med", "low", "missing"] as const) {
    const b = agg.calibration[bucket];
    lines.push(`| ${bucket} | ${b.n} | ${b.n === 0 ? "—" : pct(rate(b.familyAltOk, b.n))} |`);
  }
  return lines.join("\n");
}

export function renderReport(opts: {
  model: string;
  scores: PlayScore[];
  costUsd: number | null;
  notes?: string[];
}): string {
  const { model, scores, costUsd } = opts;
  const verified = scores.filter((s) => s.verified);
  const unverified = scores.filter((s) => !s.verified);

  const lines: string[] = [];
  lines.push(`# Photo-import extraction eval — ${model}`);
  lines.push("");
  if (costUsd !== null) lines.push(`API cost for this run: **$${costUsd.toFixed(3)}**`);
  for (const n of opts.notes ?? []) lines.push(`> ${n}`);
  lines.push("");

  if (verified.length > 0) lines.push(aggregateSection(`Verified goldens (${verified.length} plays)`, aggregate(verified)));
  else lines.push("> ⚠️ **No goldens are verified yet.** All numbers below are provisional — the labels themselves need a human pass (see GOLDENS-REVIEW.md).");
  lines.push("");
  if (unverified.length > 0) lines.push(aggregateSection(`Unverified goldens (${unverified.length} plays — provisional)`, aggregate(unverified)));
  lines.push("");

  lines.push("## Per-play detail");
  lines.push("");
  for (const s of scores) {
    lines.push(`### Play ${s.index}${s.verified ? "" : " (golden unverified)"}`);
    lines.push("");
    lines.push(
      `Formation: expected **${s.formationExpected}**, got **${s.formationGot ?? "—"}** ${s.formationOk ? "✅" : "❌"}`,
    );
    lines.push("");
    lines.push("| player | expected | got | family | depth | dir | conf |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const a of s.assignments) {
      const fam = a.familyExpected === null ? "—" : a.familyAltOk ? (a.familyOk ? "✅" : "✅ alt") : "❌";
      const depth =
        a.depthDelta === null ? "—" : `${a.depthOk ? "✅" : "❌"} Δ${a.depthDelta.toFixed(0)}yd`;
      const dir = a.directionOk === null ? "—" : a.directionOk ? "✅" : "❌";
      const expected = `${a.familyExpected ?? "(non-route)"}${a.depthExpected != null ? ` @${a.depthExpected}` : ""}`;
      const got = a.present ? `${a.familyGot ?? "(non-route)"}${a.depthGot != null ? ` @${a.depthGot}` : ""}` : "MISSING";
      lines.push(`| ${a.player} | ${expected} | ${got} | ${fam} | ${depth} | ${dir} | ${a.confidence ?? "—"} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
