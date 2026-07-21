/**
 * Spec → Notes projection.
 *
 * Generates canonical coaching notes from a PlaySpec. Output is plain
 * text with @Label player references that the renderer auto-links to the
 * diagram tokens. Intended uses:
 *   - Initial notes draft when Cal creates a play with a PlaySpec.
 *   - Lint-pass reference: when Cal rephrases the prose in its own voice,
 *     a future Phase 4+ check parses the rephrased notes back to spec
 *     assignments and rejects mismatches.
 *
 * Style matches the conventions in update_play_notes' description:
 *   - Per-player @Label references (e.g. @X, @Z, @F)
 *   - Short bullets, scannable
 *   - Open with QB read for offense, with watch-fors for defense
 *   - Per-route bullet derived from the catalog's coaching cue
 *
 * Why projection (not LLM generation):
 *   - Bidirectional invariant: the same spec produces the same notes,
 *     deterministically. The diagram and the prose share a source.
 *   - Coverage: every assignment in the spec gets a bullet — no silent
 *     omission of a receiver who has a route but no narration.
 *   - Drift: when the catalog's coaching cue updates, the notes update
 *     for free — no "KB drifted from catalog" failure mode.
 *
 * What this is NOT:
 *   - A replacement for human coaching language. Cal can rephrase the
 *     output in its voice; the lint pass (Phase 4) will keep it factual.
 *   - A pose classifier. If the spec doesn't have an assignment for a
 *     player, this function does NOT invent one.
 */

import type {
  AssignmentAction,
  DefenderAction,
  DefenderAssignment,
  PlaySpec,
  PlayerAssignment,
} from "@/domain/play/spec";
import { findTemplate } from "@/domain/play/routeTemplates";
import { detectConcept } from "@/domain/play/conceptMatch";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import {
  alignmentWithAssignments,
  findDefensiveAlignment,
  zonesForStrength,
  type DefenderAssignmentSpec,
  type DefensiveAlignmentZone,
} from "@/domain/play/defensiveAlignments";

/** Render a PlaySpec into coaching notes. */
export function projectSpecToNotes(spec: PlaySpec): string {
  // **Defense in depth (2026-05-26)**: filter spec.assignments to the
  // players the renderer ACTUALLY places on the field. The render path
  // silently drops assignments whose player isn't in the synthesized
  // roster (e.g. @S in a flag_6v6 formation that has no @S), but the
  // notes projector historically iterated `spec.assignments` directly —
  // so the prose described ghost players the coach couldn't see. This
  // wrapper makes that class of bug structurally impossible: anything
  // not in the rendered diagram cannot appear in the notes. Crashes in
  // the renderer fall through to trusting the spec (a no-op filter) so
  // we never lose ALL bullets to a rendering edge case.
  const filtered = filterAssignmentsToActualRoster(spec);
  const playType = filtered.playType ?? "offense";
  if (playType === "defense") {
    return projectDefenseSpec(filtered);
  }
  return projectOffenseSpec(filtered);
}

/** Return a spec whose `assignments` only includes players the
 *  renderer actually places. See the comment in `projectSpecToNotes`
 *  for why this is the projector's first move. */
function filterAssignmentsToActualRoster(spec: PlaySpec): PlaySpec {
  let actualIds: Set<string>;
  try {
    const { diagram } = playSpecToCoachDiagram(spec);
    actualIds = new Set(diagram.players.map((p) => p.id));
  } catch {
    // Renderer crashed — fall back to no filter (better partial notes
    // than zero notes).
    return spec;
  }
  // qbDropback() emits an assignment with player "Q" but the renderer
  // places the QB with id "QB". Treat "Q" as a synonym so we don't
  // drop the QB's (already-unspecified) assignment for a label mismatch.
  if (actualIds.has("QB")) actualIds.add("Q");
  // Mirror the renderer's id-uniquing for defense: two DTs become DT
  // and DT2. The spec might reference the bare role; accept either
  // form to avoid filtering valid defender assignments.
  const filteredAssignments = spec.assignments.filter((a) =>
    actualIds.has(a.player),
  );
  if (filteredAssignments.length === spec.assignments.length) return spec;
  return { ...spec, assignments: filteredAssignments };
}

function projectOffenseSpec(spec: PlaySpec): string {
  const lines: string[] = [];

  // **Run-play detection** (2026-05-25 regression). Any `kind: "carry"`
  // assignment marks this as a run-flavored play. The flag plumbs
  // through `bulletFor` → `narrateAction` → `narrateBlock` so OL bullets
  // switch from "pass protect" (the pass-game default) to a run-block
  // phrasing on run plays. Without this, every run play's OL bullets
  // read as if the line was pass-protecting — which is exactly the
  // user-reported bug (Dive Right showing 5× "pass protect").
  const isRunPlay = spec.assignments.some((a) => a.action.kind === "carry");
  const coverage = spec.defense?.coverage?.toLowerCase();
  const playCtx: NarrationContext = { isRunPlay, coverage };

  // **When-to-use lead.** Every play opens with a one-line situational
  // cue — a coach scanning the play card / playsheet must know "when do
  // I call this?" within the first sentence. Surfaced 2026-05-04: the
  // prior projector skipped straight to "@Q reads ..." which described
  // mechanics, not situations.
  //
  // Source order:
  //   1. Concept hit → use the concept's tactical description (it
  //      already names the coverage families and stress points).
  //   2. Feature-based fallback → derive from depth profile / run vs
  //      pass / route mix.
  const conceptHit = detectConcept(spec);
  if (conceptHit && conceptHit.ok) {
    lines.push(`**${conceptHit.concept.name}** — ${conceptHit.concept.description}`);
  } else {
    lines.push(`**Use when:** ${whenToUseForOffense(spec)}`);
  }

  // Opener — offense-perspective (the @Q read summary).
  lines.push(openerForOffense(spec));

  // **QB progression block** (Item 1, 2026-05-25). When the play has
  // ≥ 2 routes, emit a numbered read order BEFORE the per-player
  // bullets so coaches scanning the play see WHAT to teach the QB in
  // sequence. Concept-known plays (Mesh, Smash, Curl-Flat, etc.) use
  // structural read order; generic plays use depth-based scoring.
  // Suppressed on single-route demos and run-only plays.
  const progression = progressionLines(spec);
  const hasProgression = progression !== null && progression.length > 0;
  if (hasProgression) {
    lines.push("");
    lines.push("**Progression:**");
    for (const p of progression!) lines.push(p);
    lines.push("");
  }

  // Per-assignment bullet. Skip `unspecified` — they add noise.
  // **Suppress route bullets when the Progression block exists**
  // (2026-05-26). Both the numbered progression and the per-route
  // bullet describe the same data — family + depth + coaching cue —
  // so showing both reads as duplicated content on library pages
  // and in chat. Non-route bullets (carries, blocks, RPO reads,
  // motion) still render because the progression doesn't describe
  // those.
  for (const assignment of spec.assignments) {
    if (hasProgression && assignment.action.kind === "route") continue;
    const bullet = bulletFor(assignment, playCtx);
    if (bullet) lines.push(`- ${bullet}`);
  }

  // Ball-flow ledger — when a play has multi-handoff exchanges
  // (reverses, jet sweeps with handback), narrate the sequence
  // explicitly so the coach can see the ball's path through the
  // backfield at a glance. The per-player bullets describe each
  // carrier's leg with the ball; this section describes the EXCHANGE
  // points that link those legs.
  const ballFlowLines = ballFlowBullets(spec);
  if (ballFlowLines.length > 0) {
    lines.push("");
    lines.push("**Ball flow:**");
    for (const bl of ballFlowLines) lines.push(`- ${bl}`);
  }

  // Defender bullets — one per defender (catalog default + spec deviations).
  // For offense-focused plays we emit a compact "Defense:" header followed
  // by the per-defender lines. Suppress when the spec has no defense ref.
  const defenderLines = bulletsForDefense(spec);
  if (defenderLines.length > 0) {
    lines.push("");
    lines.push("**Defense:**");
    for (const dl of defenderLines) lines.push(`- ${dl}`);
  }

  if (lines.length === 0) {
    lines.push(summaryLine(spec));
  }

  return lines.join("\n");
}

/**
 * Defense-side projection. The structural difference from offense:
 *
 *   - Lead with the defender perspective (the play IS the defense),
 *     not the QB's reads. Defender bullets come FIRST.
 *   - Suppress offense `assignments` bullets entirely. On a defense
 *     play the offense is a hypothetical look the defense reacts to,
 *     not the play being authored. Including bullets like "@X: 5-yard
 *     slant" reads as "we've called the offense's routes for them" and
 *     is exactly the offense-POV bug the side-aware path is fixing.
 *   - Opener mirrors the offense pattern (when-to-call + primary key)
 *     so the play card preview surfaces the same first-3-sentences
 *     density coaches get on offense.
 */
function projectDefenseSpec(spec: PlaySpec): string {
  const lines: string[] = [];
  // When-to-call lead — same intent as offense's when-to-use line.
  lines.push(`**Use when:** ${whenToUseForDefense(spec)}`);
  lines.push(openerForDefense(spec));

  const defenderLines = bulletsForDefense(spec);
  if (defenderLines.length > 0) {
    lines.push("");
    lines.push("**Assignments:**");
    for (const dl of defenderLines) lines.push(`- ${dl}`);
  }

  if (lines.length <= 1) {
    // Opener-only fallback when the catalog has no alignment for the
    // (variant, front, coverage) tuple. Better than an empty notes
    // field — the coach can edit from there.
    lines.push("");
    lines.push(summaryLine(spec));
  }

  return lines.join("\n");
}

/**
 * Build per-defender bullets from the spec's defense ref (catalog
 * defaults) overlaid with `spec.defenderAssignments` (deviations). Each
 * line names the defender + role + a short coaching cue from
 * DEFENDER_CUES below.
 */
function bulletsForDefense(spec: PlaySpec): string[] {
  if (!spec.defense) return [];
  const { front, coverage, strength = "right" } = spec.defense;
  const alignment = findDefensiveAlignment(spec.variant, front, coverage);
  if (!alignment) return [];

  const catalogPlayers = alignmentWithAssignments(alignment, strength);
  const zones = zonesForStrength(alignment, strength);
  const zoneById = new Map<string, DefensiveAlignmentZone>();
  for (const z of zones) {
    if (z.id) zoneById.set(z.id, z);
  }

  // Mirror the renderer's id-uniquing: two DTs become DT + DT2, etc.
  // Match against either the bare role or the suffixed id when looking
  // up overrides so coaches can reference either form.
  const seen = new Map<string, number>();
  const uniqueIds = catalogPlayers.map((cp) => {
    const count = (seen.get(cp.id) ?? 0) + 1;
    seen.set(cp.id, count);
    return count === 1 ? cp.id : `${cp.id}${count}`;
  });

  const overridesByUid = new Map<string, DefenderAssignment>();
  for (const da of spec.defenderAssignments ?? []) {
    const idxByUnique = uniqueIds.findIndex((id) => id === da.defender);
    const idx = idxByUnique >= 0 ? idxByUnique : catalogPlayers.findIndex((p) => p.id === da.defender);
    if (idx < 0) continue;
    const key = uniqueIds[idx];
    if (!overridesByUid.has(key)) overridesByUid.set(key, da);
  }

  // Defender context (Item 4): pick coverage-aware cues based on the
  // spec's defense.coverage. When the spec doesn't have a coverage
  // label, fallthrough to the generic per-action cues.
  const defCtx: DefenderNarrationContext = {
    coverage: spec.defense?.coverage?.toLowerCase(),
  };

  const lines: string[] = [];
  for (let i = 0; i < catalogPlayers.length; i++) {
    const cp = catalogPlayers[i];
    const uid = uniqueIds[i];
    const ref = `@${uid}`;
    const override = overridesByUid.get(uid);
    const action: DefenderAction = override
      ? override.action
      : defenderActionFromCatalog(cp.assignment);
    const hedge =
      override?.confidence === "low" ? "(unconfirmed) " : "";
    const body = narrateDefender(ref, action, zoneById, defCtx);
    if (body) lines.push(`${hedge}${body}`);
  }
  return lines;
}

function defenderActionFromCatalog(c: DefenderAssignmentSpec): DefenderAction {
  switch (c.kind) {
    case "zone": return { kind: "zone_drop", zoneId: c.zoneId };
    case "man":  return { kind: "man_match", target: c.target };
    case "blitz": return { kind: "blitz", gap: c.gap };
    case "spy":  return { kind: "spy", target: c.target };
  }
}

function narrateDefender(
  ref: string,
  action: DefenderAction,
  zoneById: Map<string, DefensiveAlignmentZone>,
  defCtx: DefenderNarrationContext = NO_DEF_CTX,
): string | null {
  switch (action.kind) {
    case "zone_drop": {
      const zone = action.zoneId ? zoneById.get(action.zoneId) : null;
      const label = zone?.label ?? action.zoneId ?? "zone";
      // **Coverage-aware cue lookup** (Item 4, 2026-05-25). Pick a
      // more specific cue based on coverage + zone label when one is
      // catalogued; fall back to the generic flat cue otherwise.
      const cue = lookupZoneDropCue(defCtx.coverage, action.zoneId, label) ?? DEFENDER_CUES.zone_drop;
      return `${ref}: drops into ${label} — ${cue}.`;
    }
    case "man_match": {
      const target = action.target ? `@${action.target}` : "his matched receiver";
      // Same coverage-aware lookup for man — pressed in Cover 0 vs
      // off-trail in Cover 1, for example.
      const cue = lookupManMatchCue(defCtx.coverage) ?? DEFENDER_CUES.man_match;
      return `${ref}: man on ${target} — ${cue}.`;
    }
    case "blitz": {
      const gap = action.gap ?? "A";
      const cue = DEFENDER_CUES.blitz;
      return `${ref}: blitz ${gap}-gap — ${cue}.`;
    }
    case "spy": {
      const target = action.target ? `@${action.target}` : "the QB";
      const cue = DEFENDER_CUES.spy;
      return `${ref}: spy ${target} — ${cue}.`;
    }
    case "read_and_react": {
      // **Trigger-phase narration** (Item 4, 2026-05-25). When the
      // spec sets `trigger.on` (release / break / snap), weave the
      // phase into the prose so coaches see WHEN the defender reads,
      // not just THAT they react. Without this, every read_and_react
      // line read as "react when @S declares" — coaches can't teach
      // the timing from that.
      const cue = DEFENDER_CUES[`react_${action.behavior}` as keyof typeof DEFENDER_CUES] ?? DEFENDER_CUES.read_and_react;
      const trigger = `@${action.trigger.player}`;
      const phase = phraseForTriggerPhase(action.trigger.on);
      return `${ref}: read ${trigger}${phase} — ${cue}.`;
    }
    case "custom_path":
      return `${ref}: ${action.description}.`;
  }
}

/** Translates the structural `trigger.on` enum into a coach-readable
 *  phrase. Empty string when unset so the caller's prose flows
 *  naturally ("read @S — carry the vertical..."). */
function phraseForTriggerPhase(
  on: "release" | "break" | "snap" | undefined,
): string {
  if (on === "release") return "'s release";
  if (on === "break") return " at the break";
  if (on === "snap") return " at the snap";
  return "";
}

/** Per-zone coverage-aware cues (Item 4, 2026-05-25). Same pattern as
 *  `ROUTE_CUES_BY_COVERAGE` — keyed by `normalizeCoverageKey(coverage)`
 *  → `zoneId` → cue. The fallback uses the zone LABEL when zoneId is
 *  missing (some catalog entries carry only labels).
 *
 *  Authoring rules:
 *   - Be coverage-specific. A Cover 2 corner's job (cloud / squat /
 *     reroute #1) is fundamentally different from a Cover 3 corner's
 *     job (deep third / cushion). The cue must teach the difference.
 *   - Use yardage and leverage cues coaches use ("squat at 5",
 *     "deep third with outside leverage").
 *   - 1 sentence, no trailing period (caller adds it). */
function lookupZoneDropCue(
  coverage: string | undefined,
  zoneId: string | undefined,
  label: string,
): string | undefined {
  const key = normalizeCoverageKey(coverage);
  if (!key) return undefined;
  const byCoverage = ZONE_DROP_CUES_BY_COVERAGE[key];
  if (!byCoverage) return undefined;
  // Try by zoneId first (canonical), then by label (fallback). Allows
  // the catalog to evolve its zoneId names without breaking cues.
  if (zoneId && byCoverage[zoneId]) return byCoverage[zoneId];
  // Match against the LABEL too — common labels: "Deep 1/3 L", "Flat R",
  // "Hook M", "Deep 1/2 R", "Deep middle". Normalize for case + spaces.
  const labelKey = label.toLowerCase().trim();
  // Try a couple of label-derived shapes.
  for (const k of Object.keys(byCoverage)) {
    if (labelKey.includes(k.toLowerCase())) return byCoverage[k];
  }
  return undefined;
}

const ZONE_DROP_CUES_BY_COVERAGE: Record<string, Record<string, string>> = {
  // Cover 2: two-deep halves, five underneath. Corners are the
  // "cloud" — squat in the flat, reroute #1, sink under any vertical.
  "cover 2": {
    flat_l: "squat at 5 yds in the cloud — reroute #1 inside, sink under any vertical to the deep half",
    flat_r: "squat at 5 yds in the cloud — reroute #1 inside, sink under any vertical to the deep half",
    flat: "squat at 5 yds in the cloud — reroute #1 inside, sink under any vertical to the deep half",
    hook_m: "drop to 10-12 yds in the middle — eyes on the QB, carry any seam threats vertical",
    hook_l: "drop to the curl-flat window at 10 yds — wall off the dig, jump the hitch",
    hook_r: "drop to the curl-flat window at 10 yds — wall off the dig, jump the hitch",
    "deep 1/2 l": "play the left deep half — cushion outside #1, robber any inside route",
    "deep 1/2 r": "play the right deep half — cushion outside #1, robber any inside route",
  },
  // Cover 3: three-deep, four underneath. Corners take the deep
  // thirds; FS takes the deep middle.
  "cover 3": {
    "deep 1/3 l": "deep third with outside leverage — cushion 8 yds, beat the receiver to any post or corner",
    "deep 1/3 r": "deep third with outside leverage — cushion 8 yds, beat the receiver to any post or corner",
    "deep middle": "deep middle third — read #2's release, drive on any post or seam",
    flat_l: "curl-to-flat with apex leverage — sink to 10 if no flat threat, jump the flat on release",
    flat_r: "curl-to-flat with apex leverage — sink to 10 if no flat threat, jump the flat on release",
    flat: "curl-to-flat with apex leverage — sink to 10 if no flat threat, jump the flat on release",
    hook_m: "drop the middle hook — read the QB's eyes, carry vertical to the deep middle if threatened",
    hook_l: "drop the curl-hook on the strong side — sink to 12 yds on any vertical release from #2",
    hook_r: "drop the curl-hook on the strong side — sink to 12 yds on any vertical release from #2",
  },
  // Tampa 2: 2 + 1-deep variant — MLB carries the deep middle hole.
  "tampa 2": {
    flat_l: "squat at 5 in the cloud — reroute #1, sink under vertical",
    flat_r: "squat at 5 in the cloud — reroute #1, sink under vertical",
    "deep 1/2 l": "deep half over the top — robber the inside post when MLB carries the seam",
    "deep 1/2 r": "deep half over the top — robber the inside post when MLB carries the seam",
    hook_m: "Tampa drop — carry the seam vertical to 18 yds, robber the dig",
  },
  // Cover 1 (single-high man underneath). FS plays the deep middle as
  // a robber/help; pattern-match LBs cover their assigned receivers.
  "cover 1": {
    "deep middle": "deep middle robber — read QB's eyes, drive on any crosser or post",
    "deep 1/3 l": "deep middle help — pattern-match the inside vertical from #2",
    "deep 1/3 r": "deep middle help — pattern-match the inside vertical from #2",
  },
  // Cover 4 (quarters). Safeties pattern-match the inside vertical;
  // corners take #1 vertical with cushion.
  "cover 4": {
    "deep 1/4 l": "quarters — pattern-match #2 vertical, robber any inside-breaking route",
    "deep 1/4 r": "quarters — pattern-match #2 vertical, robber any inside-breaking route",
    "deep 1/3 l": "quarters bracket on #1 — cushion outside, carry vertical",
    "deep 1/3 r": "quarters bracket on #1 — cushion outside, carry vertical",
  },
  quarters: {
    "deep 1/4 l": "quarters — pattern-match #2 vertical, robber any inside-breaking route",
    "deep 1/4 r": "quarters — pattern-match #2 vertical, robber any inside-breaking route",
  },
};

/** Per-coverage man cues. Cover 0 = all-out blitz, no help; Cover 1 =
 *  single-high help over the top, so corners can trail-tech and play
 *  inside leverage. */
function lookupManMatchCue(coverage: string | undefined): string | undefined {
  const key = normalizeCoverageKey(coverage);
  if (!key) return undefined;
  return MAN_MATCH_CUES_BY_COVERAGE[key];
}

const MAN_MATCH_CUES_BY_COVERAGE: Record<string, string> = {
  "cover 0": "no help — press and stick to the inside hip, never let the receiver under the route",
  "cover 1": "trail technique with inside leverage — FS has help over the top, take the underneath route",
  man: "press the release, mirror the break, find the ball after the catch point",
};

/** Defender-narration context — analogous to NarrationContext but for
 *  the defense side of the spec. Carried as a fourth arg to
 *  `narrateDefender`. */
type DefenderNarrationContext = {
  /** Lowercased coverage label from spec.defense.coverage. Used to
   *  pick coverage-specific cues for zone_drop and man_match. */
  coverage?: string;
};
const NO_DEF_CTX: DefenderNarrationContext = {};

/**
 * Per-kind coaching cues for defenders. Single line, no trailing period
 * (caller adds it). New defender kinds added in spec.ts MUST add a cue
 * here in the same commit (Rule 3 lockstep).
 */
const DEFENDER_CUES = {
  zone_drop: "stay in the void, eyes on the QB",
  man_match: "press the release, stay on the inside hip",
  blitz: "win the half-man, get to the QB on the third step",
  spy: "shadow the player, mirror lateral movement, fall to the LOS on a scramble",
  read_and_react: "key the offensive player, react when they declare",
  react_jump_route: "drive on the route once it breaks across",
  react_carry_vertical: "carry the vertical until the deep defender takes it",
  react_follow_to_flat: "follow the inside-out release into the flat",
  react_wall_off: "wall off the crosser before they cross your face",
  react_robber: "lurk for a crossing route at intermediate depth",
} as const;

/**
 * Feature-based when-to-use line for offense plays where no named concept
 * was matched. Derives a one-sentence situational cue from depth profile,
 * run/pass mix, and route families. The phrasing is intentionally generic
 * — Cal is expected to rephrase notes after `create_play` with a more
 * specific opener; this is the structural fallback so even un-rephrased
 * notes give the coach a "when do I call this?" answer at a glance.
 */
function whenToUseForOffense(spec: PlaySpec): string {
  const routeAssignments = spec.assignments.filter(
    (a): a is PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> } =>
      a.action.kind === "route",
  );
  const hasCarry = spec.assignments.some((a) => a.action.kind === "carry");
  const hasMotion = spec.assignments.some((a) => a.action.kind === "motion");

  // Resolve effective depth for each route — explicit depthYds wins,
  // else the catalog midpoint.
  const depths = routeAssignments
    .map((a) => {
      if (typeof a.action.depthYds === "number") return a.action.depthYds;
      const t = findTemplate(a.action.family);
      if (!t) return null;
      return (t.constraints.depthRangeYds.min + t.constraints.depthRangeYds.max) / 2;
    })
    .filter((d): d is number => typeof d === "number");

  const maxDepth = depths.length ? Math.max(...depths) : 0;
  const allShallow = depths.length > 0 && depths.every((d) => d <= 6);
  const hasDeepShot = maxDepth >= 14;

  if (hasCarry && routeAssignments.length === 0) {
    return "Ground call — set the run game on early downs or short-yardage.";
  }
  if (hasCarry) {
    return "Run-pass mix — early-down call to keep the defense honest.";
  }
  if (allShallow) {
    return "Quick-game answer — best vs pressure or on rhythm throws (1st/2nd & short).";
  }
  if (hasDeepShot) {
    return "Shot play — best when the defense is sitting on the underneath, or when you need a chunk gain.";
  }
  if (hasMotion) {
    return "Best when you want pre-snap motion to declare coverage and shift leverage.";
  }
  return "Best on early downs to attack the called coverage with a balanced progression.";
}

/**
 * Feature-based when-to-call line for defense plays. Mirrors the offense
 * helper — situational cue surfaced in the first sentence so the play
 * card preview tells the coach "when do I dial this up?".
 */
function whenToUseForDefense(spec: PlaySpec): string {
  const coverage = spec.defense?.coverage?.toLowerCase() ?? "";
  const front = spec.defense?.front?.toLowerCase() ?? "";
  const hasBlitz = (spec.defenderAssignments ?? []).some((d) => d.action.kind === "blitz");

  if (hasBlitz) {
    return "Pressure call — best on obvious passing downs (3rd-and-long) when you need to disrupt the QB.";
  }
  if (coverage.includes("man")) {
    return "Best when you have matchups you trust — challenge releases, take away the quick game.";
  }
  if (coverage.includes("cover 0") || coverage.includes("cover 1")) {
    return "Tight-coverage call — best in known passing situations with an extra rusher.";
  }
  if (coverage.includes("cover 2")) {
    return "Best on early downs when you want to take away deep halves and keep things in front.";
  }
  if (coverage.includes("cover 3") || coverage.includes("zone")) {
    return "Best when you want help over the top — keep the ball in front and rally to tackle.";
  }
  if (front.includes("nickel") || front.includes("dime")) {
    return "Sub-package call — best on long-yardage / spread looks.";
  }
  return "Base call — best on early downs against balanced personnel.";
}

function openerForOffense(spec: PlaySpec): string {
  const formationLabel = spec.formation.name || "the formation";
  const defenseLabel = spec.defense
    ? ` vs ${spec.defense.front === spec.defense.coverage ? spec.defense.coverage : `${spec.defense.front} ${spec.defense.coverage}`}`
    : "";
  // Run plays (carry assignment present) get a run-flavored opener.
  // The "@Q reads ... work the progression below" framing reads as if
  // the QB is going to throw — wrong on a Sweep / Counter / Power
  // where the QB hands off and the receiver routes are decoys. The
  // run-play opener names the ball-flow shape (handoff) and points
  // the coach at the OL bullets below where the real teaching lives.
  const isRunPlay = spec.assignments.some((a) => a.action.kind === "carry");
  if (isRunPlay) {
    return `Run from ${formationLabel}${defenseLabel}. The handoff sets up the play; see the OL + receiver bullets below for each player's job.`;
  }
  // Identify the QB read by walking assignments — the deepest inside
  // route is usually the primary, with a quick-game outlet underneath.
  // For a v1 projection we just name the play context; Phase 4 will
  // teach this function to walk assignments and infer the read.
  return `@Q reads ${formationLabel}${defenseLabel}: take the open window — work the progression below in order.`;
}

// ── QB progression walker (Item 1, 2026-05-25) ──────────────────────────
//
// Walks the route assignments of a pass play and emits a numbered
// **Progression:** block in standard read order. Two paths:
//
//   1. **Concept-known** → use `CONCEPT_PROGRESSIONS[concept.name]` to
//      pick the read order structurally (Mesh reads under-drag first
//      regardless of depths). Each concept entry is an ordered list of
//      `{ family, role? }` selectors; the walker resolves each selector
//      to the matching spec assignment.
//   2. **Generic depth-based** → priority-score each route by family +
//      depth (deep clear → high → intermediate → checkdown) and sort.
//
// The block is suppressed when there are < 2 routes (no read order to
// teach) OR when the play is run-only (no QB progression). Returns null
// in either case and the caller skips the block.

/** Generic priority score — lower = read earlier. Tuned so:
 *  - 1xx = deep clears (Go, Post, Seam ≥ 14yd; Corner ≥ 12yd)
 *  - 2xx = intermediate over the middle (Dig, In, Drive 10-14yd)
 *  - 3xx = intermediate outside / rhythm (Curl, Hitch, Out, Slant, Comeback 4-13yd)
 *  - 4xx = checkdown / outlet (Flat, Drag, Bubble, Sit, Arrow, Spot, Wheel)
 *
 *  Within each band, deeper routes read first — the deep clear pulls
 *  the safety, the high element of a high-low precedes the low, etc. */
function progressionPriority(
  family: string,
  effectiveDepth: number,
): number {
  const f = family.toLowerCase();
  // Deep clears (band 100s). Deeper = earlier.
  if (f === "go" || f === "post" || f === "seam" || f === "fade" || f === "skinny post") {
    return 100 - effectiveDepth; // 18yd Go → 82, 14yd Seam → 86
  }
  if (f === "corner" && effectiveDepth >= 12) return 105 - effectiveDepth;
  if (f === "comeback" && effectiveDepth >= 14) return 110 - effectiveDepth;
  // Intermediate over the middle (band 200s). Deeper = earlier.
  if (f === "dig" || f === "in" || f === "z-in") return 220 - effectiveDepth;
  // Intermediate outside / rhythm (band 300s).
  if (f === "out" || f === "quick out") return 320 - effectiveDepth;
  if (f === "z-out") return 315 - effectiveDepth; // deeper double-break out
  if (f === "curl" || f === "hook in") return 330 - effectiveDepth;
  if (f === "hitch" || f === "quick in") return 340 - effectiveDepth;
  if (f === "comeback" || f === "hook out") return 335 - effectiveDepth;
  if (f === "slant") return 350 - effectiveDepth;
  if (f === "whip") return 345 - effectiveDepth;
  // Wheel can be a deep outside threat; depth disambiguates.
  if (f === "wheel" && effectiveDepth >= 12) return 115 - effectiveDepth;
  if (f === "wheel") return 360;
  // Checkdown / outlet (band 400s). Lower band; not yet ordered within.
  if (f === "flat" || f === "drag" || f === "bubble" || f === "sit" ||
      f === "arrow" || f === "spot" || f === "out & up" || f === "stop & go") {
    return 400 + (effectiveDepth || 0);
  }
  // Unknown family → middle of the pack so it doesn't dominate.
  return 500;
}

/**
 * Concept-specific progression. Each entry is an ordered list of
 * `{ family, role? }` selectors — the walker resolves them against the
 * spec's route assignments in order. The `role` filter is used when the
 * concept has multiple routes in the same family but at different
 * depths (Mesh's two Drags) — set `role` to "under" / "over" / "low" /
 * "high" / "outside" to pick which one is read first.
 *
 * Concepts NOT in this map fall back to the generic depth walker. The
 * map is intentionally small at first — add concepts as coaches
 * surface notes that read wrong. The catalog's `description` field on
 * the concept entry holds the prose explanation; this is just the
 * read-order data.
 */
type ProgressionSelector = {
  family: string;
  /** Used to disambiguate same-family routes in the same concept. */
  role?: "under" | "over" | "low" | "high" | "inside" | "outside";
};

const CONCEPT_PROGRESSIONS: Record<string, ProgressionSelector[]> = {
  // Mesh: under-drag (rub) → over-drag (window) → sit/curl (high) →
  // flat/back (checkdown). Coaches want the under-drag named first so
  // the timing of the rub-into-mesh-window is taught explicitly.
  mesh: [
    { family: "Drag", role: "under" },
    { family: "Drag", role: "over" },
    { family: "Sit" },
    { family: "Curl" },
    { family: "Flat" },
  ],
  // Curl-Flat: high-low on the flat defender. The Curl is the high,
  // the Flat is the low — high read first.
  "curl-flat": [
    { family: "Curl" },
    { family: "Flat" },
  ],
  // Smash: Corner over Hitch — corner pulls the safety / corner; hitch
  // sits underneath. Corner is THE read; hitch is the throwback.
  smash: [
    { family: "Corner" },
    { family: "Hitch" },
  ],
  // Stick: Sit (the stick) over Flat — stick is the rhythm read; flat
  // is the outlet.
  stick: [
    { family: "Sit" },
    { family: "Flat" },
  ],
  // Snag: Corner → Spot → Flat. Corner is the deep stretch; Spot is
  // the middle of the triangle; Flat is the outlet.
  snag: [
    { family: "Corner" },
    { family: "Spot" },
    { family: "Flat" },
  ],
  // Four Verticals: read SAFETY rotation. With single-high → seams;
  // with two-high → outside Go's. For a v1 we list seams first since
  // that's the most common single-high look in youth/HS football.
  "four verticals": [
    { family: "Seam" },
    { family: "Go" },
  ],
  // Flood/Sail: 3-level side stretch. Corner (high) → Curl (mid) →
  // Flat (low). The horizontal stretch reads top-down.
  flood: [
    { family: "Corner" },
    { family: "Curl" },
    { family: "Flat" },
  ],
  sail: [
    { family: "Corner" },
    { family: "Curl" },
    { family: "Flat" },
  ],
  // Drive: shallow under-drag (rub setup) → deep dig (the void).
  drive: [
    { family: "Drag" },
    { family: "Dig" },
  ],
  // Levels: low in-route → high in-route. The high reads after low to
  // attack the LB driving on the underneath route.
  levels: [
    { family: "In", role: "low" },
    { family: "In", role: "high" },
    { family: "Dig" },
  ],
  // Y-Cross: Post (clear) → Dig (the cross) → Flat (outlet). Post
  // pulls the safety; the Dig hits the void.
  "y-cross": [
    { family: "Post" },
    { family: "Dig" },
    { family: "Flat" },
  ],
  // Dagger: Seam (clear) → Dig (the void). The seam runs through to
  // pull the safety; the dig hits behind the LB and in front of the
  // vacated zone.
  dagger: [
    { family: "Seam" },
    { family: "Dig" },
  ],
  // Slant-Flat: Slant (rub) → Flat (mismatch). Slant first because the
  // pick-rub timing decides whether the flat is open at all.
  "slant-flat": [
    { family: "Slant" },
    { family: "Flat" },
  ],
};

/** Resolve a list of progression selectors against the spec's route
 *  assignments. Each selector picks the BEST matching route by family
 *  (case-insensitive) and role (when set). Returns the matched
 *  PlayerAssignment in selector order. Unmatched selectors are
 *  silently skipped — the walker is permissive so partial concept
 *  hits still produce useful output. */
function resolveProgressionSelectors(
  selectors: ProgressionSelector[],
  routes: Array<PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> }>,
): Array<PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> }> {
  const used = new Set<string>();
  const out: Array<PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> }> = [];
  for (const sel of selectors) {
    // Find unmatched routes whose family matches.
    const candidates = routes.filter(
      (r) => !used.has(r.player) && r.action.family.toLowerCase() === sel.family.toLowerCase(),
    );
    if (candidates.length === 0) continue;
    // Narrowed pick type — candidates is already filtered to route
    // assignments, so the pick inherits that narrowing.
    type RouteAssignment = PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> };
    let pick: RouteAssignment | undefined;
    if (sel.role === "under" || sel.role === "low") {
      // Shallower depth wins.
      pick = [...candidates].sort((a, b) => {
        return (depthOf(a) ?? 99) - (depthOf(b) ?? 99);
      })[0];
    } else if (sel.role === "over" || sel.role === "high") {
      // Deeper depth wins.
      pick = [...candidates].sort((a, b) => {
        return (depthOf(b) ?? 0) - (depthOf(a) ?? 0);
      })[0];
    } else {
      // No role filter → first candidate (deterministic since `routes`
      // is iterated in spec.assignments order).
      pick = candidates[0];
    }
    if (pick) {
      used.add(pick.player);
      out.push(pick);
    }
  }
  return out;
}

function depthOf(
  a: PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> },
): number | undefined {
  if (typeof a.action.depthYds === "number") return a.action.depthYds;
  const t = findTemplate(a.action.family);
  if (!t) return undefined;
  return (t.constraints.depthRangeYds.min + t.constraints.depthRangeYds.max) / 2;
}

/**
 * Build the QB progression block. Returns an array of lines (one per
 * read, ordered) or null when no block should render (run-only play,
 * single-route demo, no routes at all). The header line `**Progression:**`
 * is the caller's responsibility — this function only produces the
 * numbered read items.
 */
function progressionLines(spec: PlaySpec): string[] | null {
  // Run plays don't have a QB read order — the receiver routes (when
  // present) are decoys pulling defense away from the run lane, not
  // throws the QB is sequencing through. A "Progression: 1. @X 18-yd
  // go — clear the deep safety" bullet on a Sweep page reads as if
  // the QB is going to throw the Go, which is misleading. Routes
  // still surface in the per-assignment bullets below.
  const isRunPlay = spec.assignments.some((a) => a.action.kind === "carry");
  if (isRunPlay) return null;
  const routes = spec.assignments.filter(
    (a): a is PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> } =>
      a.action.kind === "route",
  );
  if (routes.length < 2) return null;

  // Concept-known path — use the concept's read order if we have one.
  const conceptHit = detectConcept(spec);
  const conceptKey = conceptHit?.ok ? conceptHit.concept.name.toLowerCase() : null;
  const conceptOrder = conceptKey ? CONCEPT_PROGRESSIONS[conceptKey] : null;

  // Type alias: route-narrowed assignment. `progressionLines` only ever
  // sees route assignments (we filter to kind:"route" above); narrowing
  // here keeps `depthOf` and `action.family` accesses type-safe.
  type RouteAssignment = PlayerAssignment & { action: Extract<AssignmentAction, { kind: "route" }> };

  let ordered: RouteAssignment[];
  // Explicit coach-authored read order wins over every heuristic — it's
  // the literal "1, 2, 3" the coach put on the wristband card. Validated
  // upstream (validatePlaySpecProgression) so every id resolves to a
  // route; any route the coach didn't list is appended via the generic
  // walker so no receiver silently drops out of the notes.
  const explicit = (spec.progression ?? [])
    .map((id) => routes.find((r) => r.player === id))
    .filter((r): r is RouteAssignment => !!r);
  if (explicit.length >= 2) {
    const listed = new Set(explicit.map((r) => r.player));
    const rest = routes.filter((r) => !listed.has(r.player));
    rest.sort((a, b) => {
      const da = depthOf(a) ?? 0;
      const db = depthOf(b) ?? 0;
      return progressionPriority(a.action.family, da) - progressionPriority(b.action.family, db);
    });
    ordered = [...explicit, ...rest];
  } else if (conceptOrder) {
    const matched = resolveProgressionSelectors(conceptOrder, routes);
    // Append any unmatched routes via the generic walker so every route
    // gets a numbered line (no silent drops).
    const matchedIds = new Set(matched.map((m) => m.player));
    const rest = routes.filter((r) => !matchedIds.has(r.player));
    rest.sort((a, b) => {
      const da = depthOf(a) ?? 0;
      const db = depthOf(b) ?? 0;
      return progressionPriority(a.action.family, da) - progressionPriority(b.action.family, db);
    });
    ordered = [...matched, ...rest];
  } else {
    // Generic path — depth-based priority sort.
    ordered = [...routes].sort((a, b) => {
      const da = depthOf(a) ?? 0;
      const db = depthOf(b) ?? 0;
      return progressionPriority(a.action.family, da) - progressionPriority(b.action.family, db);
    });
  }

  const lines: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    const depth = depthOf(r);
    const family = r.action.family.toLowerCase();
    const ref = `@${r.player}`;
    // One-sentence-per-read with the family + depth + situational role.
    // The per-read role is INFERRED from progression band so coaches
    // know WHY each route is in this position.
    const role = readRoleLabel(i, ordered.length, family, depth);
    const depthStr = typeof depth === "number" ? `${Math.round(depth)}-yd ` : "";
    // Carry confidence through to the progression line — low-confidence
    // reads get an `(unconfirmed)` prefix so coaches scanning the read
    // order know the staffing on that route isn't pinned. Before route
    // bullets were suppressed (2026-05-26), this lived on the bullet
    // line; the progression now owns it.
    const unconfirmed = r.confidence === "low" ? "(unconfirmed) " : "";
    lines.push(`${i + 1}. ${unconfirmed}**${ref} ${depthStr}${family}** — ${role}`);
  }
  return lines;
}

function readRoleLabel(
  position: number,
  total: number,
  family: string,
  depth: number | undefined,
): string {
  const isFirst = position === 0;
  const isLast = position === total - 1;
  const d = depth ?? 0;
  // Deep clear roles
  if (d >= 14 && (family === "go" || family === "seam" || family === "fade")) {
    return "clear the deep safety; throw if the corner gives a soft shoulder.";
  }
  if (d >= 12 && family === "post") {
    return "split the safeties — your home-run shot when the FS bites underneath.";
  }
  if (d >= 12 && family === "corner") {
    return "back-pylon attack — vacates the curl/flat window for the next read.";
  }
  // Intermediate roles
  if (family === "dig") {
    return isFirst ? "primary read — sit in the void between the hook and the safety." : "secondary — work behind the underneath defender's drop.";
  }
  if (family === "curl") {
    return "settle in the soft spot — face the QB and present hands.";
  }
  if (family === "hitch") {
    return "rhythm throw — eyes back on three; take it if the corner plays off.";
  }
  if (family === "out" || family === "quick out") {
    return "snap to the sideline — sideline outlet on the corner's leverage.";
  }
  if (family === "hook out") {
    return "sell the vertical, hook back to the sideline — come back hard to the throw.";
  }
  if (family === "hook in") {
    return "sell the vertical, hook back inside — settle in the soft spot between defenders.";
  }
  if (family === "quick in") {
    return "quick inside cut — beat the inside leverage, look it in across the middle.";
  }
  if (family === "z-out" || family === "z-in") {
    return "two-move route — commit defenders to the first break, then attack the second.";
  }
  if (family === "slant") {
    return "quick rhythm vs press, sit vs zone — first option on a rub or pick.";
  }
  // Checkdown / outlet
  if (family === "flat" || family === "arrow" || family === "bubble") {
    return isLast ? "outlet — last in the progression; take it on pressure or no read open." : "low element of the high-low — the throw if the curl defender drops.";
  }
  if (family === "drag" || family === "sit" || family === "spot") {
    return isFirst ? "primary — first read, find the void in zone and sit." : "settle in the underneath window — keep eyes on the QB.";
  }
  if (family === "wheel") {
    return d >= 12 ? "deep outside threat — vertical to the boundary." : "flat then turn it up — beat the LB to the sideline.";
  }
  // Default fall-back
  return isFirst ? "primary read." : isLast ? "outlet." : "secondary read.";
}

function openerForDefense(spec: PlaySpec): string {
  const defenseLabel = spec.defense
    ? `${spec.defense.front === spec.defense.coverage ? spec.defense.coverage : `${spec.defense.front} ${spec.defense.coverage}`}`
    : "this defense";
  // Mirror the offense opener pattern: lead with the defender's primary
  // key, not a generic "read the formation" line. Coaches scan the first
  // 1-3 sentences on the play card; pack the actionable trigger there.
  return (
    `Run **${defenseLabel}** — defenders read pre-snap formation and motion, ` +
    `then play their assignment below. Primary key: alignment first, eyes to keys at the snap.`
  );
}

function summaryLine(spec: PlaySpec): string {
  const formation = spec.formation.name || "Spread";
  const defense = spec.defense ? ` vs ${spec.defense.coverage}` : "";
  return `${formation}${defense}.`;
}

/**
 * Render the `ballPath` ledger as coaching bullets — one line per
 * exchange. Each line names the giver, receiver, and (when set) the
 * mesh-point yardage relative to the LOS so a coach reading the
 * notes can picture where the ball changes hands. Empty / absent
 * ballPath returns an empty array (no "Ball flow:" header rendered).
 *
 * Example output for a Jet Reverse:
 *   - Snap: @QB hands to @B at the mesh.
 *   - Then: @B hands to @X 3 yards behind the LOS.
 *
 * The wording uses football landmarks ("at the mesh", "behind the
 * LOS") rather than raw coordinates — same rule that applies to
 * every other piece of coach-facing prose.
 */
function ballFlowBullets(spec: PlaySpec): string[] {
  if (!spec.ballPath || spec.ballPath.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < spec.ballPath.length; i++) {
    const step = spec.ballPath[i];
    const lead = i === 0 ? "Snap" : "Then";
    const where = step.atPoint ? formatMeshPoint(step.atPoint) : "in the backfield";
    // "Pitches back" when the ball returns to a prior handler (flea
    // flicker, halfback option, hook-and-lateral, double pass). The
    // word "hands" implies forward / inline exchange — using it for
    // a backward lateral confuses coaches who'd read it as a forward
    // handoff. A return-to-prior step is structurally a lateral, so
    // narrate it as one.
    const returnsToPriorHandler = i > 0 && spec.ballPath
      .slice(0, i)
      .some((prev) => prev.from === step.to);
    const verb = returnsToPriorHandler ? "pitches back to" : "hands to";
    out.push(`${lead}: @${step.from} ${verb} @${step.to} ${where}.`);
  }
  return out;
}

/** Format an (x, y) mesh-point as a coach-readable football phrase.
 *  Uses landmarks (LOS, hashes) rather than raw coordinates. */
function formatMeshPoint(point: [number, number]): string {
  const [x, y] = point;
  // y < 0 = behind the LOS; y > 0 = downfield; y ≈ 0 = at the LOS.
  let depth: string;
  if (Math.abs(y) < 0.5) {
    depth = "at the line";
  } else if (y < 0) {
    depth = `${Math.abs(y).toFixed(0)} yard${Math.abs(y) >= 1.5 ? "s" : ""} behind the LOS`;
  } else {
    depth = `${y.toFixed(0)} yard${y >= 1.5 ? "s" : ""} downfield`;
  }
  // Lateral: x < 0 = left of center; x > 0 = right; |x| < 1 = middle.
  if (Math.abs(x) < 1) return depth;
  const side = x > 0 ? "right" : "left";
  const dist = Math.abs(x);
  return `${dist.toFixed(0)} yard${dist >= 1.5 ? "s" : ""} ${side} of center, ${depth}`;
}

/**
 * Per-play narration context — flags that change phrasing across many
 * assignments (e.g. "is this a run play"). Added 2026-05-25 so
 * `narrateBlock` can pick run-block vs pass-pro defaults from a single
 * play-type signal, rather than re-detecting from a per-assignment view.
 *
 * The context is computed ONCE in `projectOffenseSpec` and threaded
 * down to each `narrateAction` call. Future flags (isPlayAction,
 * isRPO, isScreen) plug into the same shape without touching the
 * narrator's call sites.
 */
export type NarrationContext = {
  /** True when any assignment in the spec has `kind: "carry"`. Used by
   *  `narrateBlock` to switch OL/blocker defaults from pass-pro to
   *  run-block phrasing. */
  isRunPlay: boolean;
  /** Lowercased + normalized coverage label from `spec.defense.coverage`
   *  (or undefined if no defense is set on the spec). Used by
   *  `narrateRoute` to look up coverage-specific teaching cues. Examples:
   *  "cover 1", "cover 2", "cover 3", "cover 4", "tampa 2", "man", "zone".
   *  Phase 2 (2026-05-25 follow-up). */
  coverage?: string;
};

const NO_CTX: NarrationContext = { isRunPlay: false };

function bulletFor(assignment: PlayerAssignment, ctx: NarrationContext = NO_CTX): string | null {
  const ref = `@${assignment.player}`;
  const body = narrateAction(ref, assignment.action, ctx);
  if (!body) return null;
  // Hedging: low-confidence assignments get prefixed with "(unconfirmed)"
  // so the coach knows Cal isn't sure. Keeps the structural meaning
  // visible (the family/depth/side stay accurate) while flagging that
  // it's a guess. Confidence is set by the parser based on match quality
  // or by Cal explicitly when authoring.
  if (assignment.confidence === "low") {
    return `(unconfirmed) ${body}`;
  }
  return body;
}

export function narrateAction(
  ref: string,
  action: AssignmentAction,
  ctx: NarrationContext = NO_CTX,
): string | null {
  switch (action.kind) {
    case "route":
      return narrateRoute(ref, action, ctx);
    case "block":
      return narrateBlock(ref, action, ctx);
    case "carry":
      return narrateCarry(ref, action);
    case "motion":
      return narrateMotion(ref, action);
    case "custom":
      return `${ref}: ${action.description}.`;
    case "unspecified":
      return null;
    case "rpo_read": {
      // First-pass coaching cue. Step 4 of the QB-runs/RPO build will
      // upgrade this to resolve the actual conflict defender via
      // defensiveAlignments.conflictDefender(scheme) and phrase the
      // read with the defender's actual id ("read #2 OLB Mike") rather
      // than the abstract role. The structural meaning is correct now
      // either way — give/throw decision keyed on a named role.
      const pull = action.pullIf ?? "in";
      const giveCue = pull === "in"
        ? `give to @${action.giveTo} when he stays out`
        : `give to @${action.giveTo} when he stays in`;
      const throwCue = pull === "in"
        ? `pull and throw to @${action.passTo} when he comes inside to fill the run`
        : `pull and throw to @${action.passTo} when he vacates out of run support`;
      return `${ref}: RPO — read the ${action.keyDefenderRole}; ${giveCue}, ${throwCue}.`;
    }
  }
}

function narrateRoute(
  ref: string,
  action: Extract<AssignmentAction, { kind: "route" }>,
  ctx: NarrationContext = NO_CTX,
): string {
  const template = findTemplate(action.family);
  if (!template) {
    return `${ref}: ${action.family} route.`;
  }

  // Depth: catalog midpoint (v1). Phase 4 will use action.depthYds when set
  // and tighten the projection to the actual rendered geometry.
  const { depthRangeYds } = template.constraints;
  const canonicalDepth = action.depthYds ?? Math.round((depthRangeYds.min + depthRangeYds.max) / 2);

  const sideLabel = sideLabelFor(template.constraints.side);
  const modifierClause = formatModifiers(action.modifiers);

  // **Coverage-aware cue lookup** (Item 2, 2026-05-25). When the spec's
  // defense coverage is set, try the coverage-specific override map
  // first. Falls back to the generic per-family cue if no override
  // exists for this (family, coverage) pair. Purely additive: every
  // route still gets a useful cue; the override just makes it more
  // specific to the defensive look.
  const familyKey = template.name.toLowerCase();
  const coverageKey = normalizeCoverageKey(ctx.coverage);
  const coverageOverride = coverageKey
    ? ROUTE_CUES_BY_COVERAGE[familyKey]?.[coverageKey]
    : undefined;
  const cue = coverageOverride ?? ROUTE_CUES[familyKey] ?? "";
  const cuePart = cue ? ` — ${cue}` : "";

  return `${ref}: ${canonicalDepth}-yard ${template.name.toLowerCase()}${sideLabel}${modifierClause}${cuePart}.`;
}

/** Normalize coverage labels to the keys used in ROUTE_CUES_BY_COVERAGE.
 *  Coaches and Cal use a few common spellings ("Cover 3", "cover3",
 *  "C3"); we collapse them to the canonical "cover N" form. Unknown
 *  labels return undefined so the caller falls back to the generic
 *  per-family cue (purely additive — adding a coverage here never
 *  breaks the existing path). */
function normalizeCoverageKey(coverage: string | undefined): string | undefined {
  if (!coverage) return undefined;
  const c = coverage.toLowerCase().trim();
  // Cover N family — match "cover 1", "cover3", "c-3", "c2", etc.
  const coverNMatch = c.match(/(?:^|\s)c(?:over)?\s*[-\s]*([0-6])\b/);
  if (coverNMatch) return `cover ${coverNMatch[1]}`;
  // Tampa 2
  if (/\btampa\s*2\b/.test(c)) return "tampa 2";
  // Generic man / zone fallback (used by some KB chunks).
  if (/^man\b/.test(c)) return "man";
  if (/^zone\b/.test(c)) return "zone";
  if (/\bquarters?\b/.test(c)) return "quarters";
  return undefined;
}

function narrateBlock(
  ref: string,
  action: Extract<AssignmentAction, { kind: "block" }>,
  ctx: NarrationContext = NO_CTX,
): string {
  if (!action.target) {
    // Default block phrasing depends on play type (2026-05-25).
    // Run play → run-block default. Pass play → pass-pro default.
    // OL on a Dive don't "pass protect" — they down-block, drive-block,
    // combo-block their assigned defender to the second level. We don't
    // have per-OL gap assignments in the spec for diagram-derived plays,
    // so the default keeps the prose honest: it tells the coach "this is
    // run blocking" without inventing a specific gap that may not match
    // the actual called scheme.
    if (ctx.isRunPlay) {
      return `${ref}: run-block — drive your man off the ball to the playside, combo to the second level.`;
    }
    return `${ref}: pass protect.`;
  }
  if (action.target === "edge") return `${ref}: protect the edge — pick up the first defender outside.`;
  if (action.target === "interior") return `${ref}: protect interior — pick up A/B-gap pressure.`;
  if (action.target === "blitz") return `${ref}: blitz pickup — find the unblocked rusher.`;
  // Sweep / Power / Counter — play-specific OL semantics (2026-05-26
  // audit). Coaches need to read the OL's actual job ("pull and lead",
  // "reach playside") not a generic "pass protect" bullet, especially
  // for tackle library pages where the OL detail IS the play.
  if (action.target === "reach_playside") {
    return `${ref}: reach block playside — drive your man down the line, seal him inside.`;
  }
  if (action.target === "pull_lead") {
    return `${ref}: pull playside — get depth off the LOS, lead through the hole for the back.`;
  }
  if (action.target === "pull_kick") {
    return `${ref}: pull playside — kick out the first defender outside the tackle box.`;
  }
  if (action.target === "cut_off") {
    return `${ref}: cut off the backside — chase block to prevent pursuit.`;
  }
  if (action.target === "corner") {
    return `${ref}: stalk-block the corner — get hands inside, drive him off coverage so the runner has the edge.`;
  }
  // Counter / Power — "down block" pins the playside defender INSIDE
  // so the pullers have a clean track. The down-blocker drives their
  // man toward the playside gap (the gap the puller fits into).
  if (action.target === "down_block") {
    return `${ref}: down block — drive your man INSIDE toward the playside gap, pin him so the pulling guard has a clean track.`;
  }
  // Dive / Inside Zone — every OL flows playside, combo-blocking to
  // the second level when the first-level defender is sealed.
  if (action.target === "zone_playside") {
    return `${ref}: zone block playside — combo with your neighbor to the LB; climb to the second level once the front defender is sealed.`;
  }
  // Draw — OL pass-sets at the snap to sell pass coverage, then
  // recovers and run-blocks as the back hits the soft middle the
  // rush vacated.
  if (action.target === "pass_set_late") {
    return `${ref}: pass-set first to sell pass; recover and run-block when the back hits the lane behind you.`;
  }
  return `${ref}: block @${action.target}.`;
}

function narrateCarry(
  ref: string,
  action: Extract<AssignmentAction, { kind: "carry" }>,
): string {
  const cue = action.runType ? RUN_CUES[action.runType] ?? "" : "";
  const cuePart = cue ? ` — ${cue}` : "";
  if (action.runType) {
    return `${ref}: ${formatRunType(action.runType)}${cuePart}.`;
  }
  // Diagram-derived carry (no runType in spec) — give a useful default
  // that names the universal read: press the LOS, key the first defender
  // who shows color (the playside LB on most run schemes), and react
  // (cut up vs scrape, bounce vs press, bend vs spill). Better than the
  // prior generic "take the handoff and run the called gap" which gave
  // the coach nothing to teach from. Surfaced 2026-05-25 alongside the
  // parser fix that finally produces this branch instead of returning a
  // misleading "Unrecognized" custom action.
  return `${ref}: take the handoff, press the LOS, and read the playside LB — if he scrapes, cut back; if he fills, bounce.`;
}

function narrateMotion(
  ref: string,
  action: Extract<AssignmentAction, { kind: "motion" }>,
): string {
  if (!action.into) return `${ref}: pre-snap motion.`;
  if (typeof action.into === "string") return `${ref}: motion to @${action.into}'s alignment before the snap.`;
  return `${ref}: motion to set position before the snap.`;
}

function sideLabelFor(side: "toward_qb" | "toward_sideline" | "vertical" | "varies"): string {
  if (side === "toward_qb") return " inside";
  if (side === "toward_sideline") return " to the sideline";
  if (side === "vertical") return ""; // vertical is implicit ("12-yard go")
  return "";
}

function formatModifiers(modifiers: ReadonlyArray<string> | undefined): string {
  if (!modifiers || modifiers.length === 0) return "";
  const parts: string[] = [];
  for (const m of modifiers) {
    if (m === "hot") parts.push("hot vs blitz");
    else if (m === "sit_vs_zone") parts.push("settle vs zone, run vs man");
    else if (m === "option") parts.push("option route — read leverage");
    else if (m === "delayed") parts.push("delayed release");
    else if (m === "rub") parts.push("set up the rub");
    else if (m === "alert") parts.push("QB's alert");
    else if (m === "motion") parts.push("after motion");
  }
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function formatRunType(t: NonNullable<Extract<AssignmentAction, { kind: "carry" }>["runType"]>): string {
  switch (t) {
    case "inside_zone": return "inside zone";
    case "outside_zone": return "outside zone";
    case "power": return "power";
    case "counter": return "counter";
    case "trap": return "trap";
    case "draw": return "draw";
    case "sweep": return "sweep";
    case "qb_keep": return "QB keep";
    case "scramble": return "scramble lane";
  }
}

/**
 * Per-family coaching cues. Single line, no period (caller adds it).
 * Keep these short and tactical — they ride on the depth/side already
 * stated by the bullet, so don't repeat that information.
 */
const ROUTE_CUES: Record<string, string> = {
  slant: "sharp break at the inside hip, catch in stride and turn upfield",
  go: "full-speed release, ball goes over the top",
  post: "plant hard at the break, separate from the safety",
  corner: "sell vertical, snap to the back pylon",
  comeback: "come back hard to the sideline, work back to the throw",
  out: "snap the head around at the break, sideline outlet",
  in: "drive vertical then break flat across the LBs",
  curl: "settle in the soft spot, face the QB",
  hitch: "quick stop, eyes back to the QB on rhythm",
  "quick out": "speed out — no break-down, snap to the sideline",
  drag: "shallow cross, find the void in zone",
  flat: "release flat — outlet for the QB",
  fade: "back-shoulder window, defender's hip",
  wheel: "flat then turn it up — beat the LB to the sideline",
  bubble: "release back and outside, eyes find the ball",
  whip: "sell the out, snap back inside",
  spot: "settle in the soft spot at 6 yds",
  "skinny post": "shallow inside angle — fit between safety and corner",
  dig: "vertical 12, sharp inside break, sit in the window",
  seam: "split the safeties, run through the post",
  "stop & go": "sell the hitch, then take it deep",
  "out & up": "sell the out, then up the sideline",
  arrow: "slight angle to the flat, gain depth gradually",
  sit: "settle in the void, face the QB",
  "z-out": "stem vertical, break inside, then continue upfield and back outside — double-move beats trailing man",
  "z-in": "stem vertical, break outside, then continue upfield and back inside — cross the defender's face on the second break",
  "hook in": "7-yd stem, U-turn back inside — settle facing the middle, find the soft spot",
  "hook out": "7-yd stem, U-turn back outside — work back to the sideline, stop the clock",
  "quick in": "quick inside cut at 4-5 yds — inside mirror of the quick out, get the ball fast",
};

/**
 * Coverage-aware route cues (Item 2, 2026-05-25). When the spec's
 * `defense.coverage` is set, the narrator looks up an override here
 * BEFORE falling back to the flat `ROUTE_CUES` cue. The map is keyed
 * by `family.toLowerCase()` → `normalizeCoverageKey(coverage)` → cue.
 *
 * Coverage keys (mirror `normalizeCoverageKey` output):
 *   "cover 0", "cover 1", "cover 2", "cover 3", "cover 4", "cover 6",
 *   "tampa 2", "man", "zone", "quarters"
 *
 * Authoring guidance:
 *   - Make the cue ACTIONABLE — name the defender / leverage / window
 *     the receiver is reading. "Beat the flat defender to the sideline"
 *     beats "stay outside."
 *   - Match the coverage's structural property. Cover 1 (man) → release
 *     leverage / pick / rub. Cover 2 (two-deep) → soft spot between
 *     CB and safety. Cover 3 (single-high zone) → curl/flat defender
 *     window. Quarters (four-deep) → safety carry / dig void.
 *   - 1 sentence, no trailing period (caller adds it).
 *
 * Coverage is sparse on purpose — add entries as coaches surface notes
 * that read wrong. Missing (family, coverage) pairs fall back to the
 * generic flat cue. This whole map can grow without touching the
 * call site.
 */
const ROUTE_CUES_BY_COVERAGE: Record<string, Record<string, string>> = {
  slant: {
    "cover 0": "all-out blitz vs man — hot route; slant the inside hip and look fast",
    "cover 1": "vs press man — rub off the trail-tech corner, eyes inside on the third step",
    "cover 2": "settle between the OLB and corner — sit vs zone, accelerate vs man",
    "cover 3": "win inside leverage — sit in the curl/flat window the apex defender opens",
    "tampa 2": "thread between the MLB's deep drop and the OLB — soft spot at 4-6 yds",
    man: "vs press man — rub the trail tech, look fast on the inside hip",
    zone: "settle in the curl/flat window — face the QB on the third step",
  },
  hitch: {
    "cover 0": "hot vs blitz — quick stop, eyes back fast, square up to the QB",
    "cover 1": "vs man — head-fake go, snap back to the throw on the third step",
    "cover 2": "sit in the soft spot between the corner (squat) and the flat defender",
    "cover 3": "settle outside the curl/flat defender — between him and the squatting CB",
    man: "vs man — sell vertical first, snap back hard to the throw",
    zone: "soft spot in the underneath zone — face the QB",
  },
  curl: {
    "cover 0": "hot vs blitz — settle early, face the QB on rhythm",
    "cover 1": "vs man — drift inside to widen the leverage, face the QB at the break",
    "cover 2": "settle behind the OLB and in front of the corner — hands ready",
    "cover 3": "soft spot at the curl line — between the curl/flat defender and the deep third",
    "tampa 2": "settle behind the MLB's drop — read the QB's eyes",
    man: "vs man — drift to widen leverage, square up at the catch",
    zone: "find the void behind the underneath zone — settle and face the QB",
  },
  out: {
    "cover 1": "vs man — speed cut to the sideline, ball arrives at the break",
    "cover 2": "snap the head outside — beat the squat corner to the sideline",
    "cover 3": "beat the flat defender to the sideline — leverage on his outside shoulder",
    "tampa 2": "snap to the boundary — under the squat corner",
    man: "win the foot race to the sideline — sharp break, eyes back",
    zone: "snap the head to the sideline — outlet on the corner's leverage",
  },
  post: {
    "cover 1": "vs single-high — split the safety and the post-safety corner; ball over the back shoulder",
    "cover 2": "splits the safeties — throw into the deep void between the two halves",
    "cover 3": "splits the FS and the deep third corner — back-shoulder window",
    "tampa 2": "shot vs the MLB's deep drop — split the safeties",
    man: "vs man — sell vertical, plant inside at the break",
  },
  corner: {
    "cover 2": "back-pylon attack — sells go, snaps to the corner behind the cloud cover",
    "cover 3": "behind the deep-third corner — leverage on his outside hip",
    "cover 4": "split the deep corner and safety — throw to the back pylon",
    man: "vs man — leverage break, ball to the back-pylon shoulder",
  },
  dig: {
    "cover 1": "vs man — sell vertical, plant hard at 12 yds, snap inside under the post-safety",
    "cover 2": "into the void between the two safeties — sit in the window at 12-14 yds",
    "cover 3": "behind the MLB / hook defender, in front of the deep middle — sit in the window",
    "cover 4": "into the dig void — work behind the OLB drop and in front of the safety carry",
    quarters: "work behind the OLB and in front of the safety carry — sit in the soft spot",
  },
  go: {
    "cover 1": "vs single-high — outrun the trail-tech corner; ball goes back-shoulder",
    "cover 2": "beat the corner's jam, attack the seam between the deep half safeties",
    "cover 3": "stretch the deep third corner — back-shoulder if he leverages outside",
    "tampa 2": "split the safeties — vertical down the MLB-vacated middle",
  },
  seam: {
    "cover 1": "vs single-high — split the FS from the post-safety pin; ball over the top",
    "cover 2": "split the two safeties — vertical down the middle of the field",
    "cover 3": "attack the seam between the deep-third defender and the curl/flat — bender if open",
    "cover 4": "vertical down the seam — read the safety's carry; sit-down if he stops",
  },
  flat: {
    "cover 2": "release flat — the corner squats; ball arrives before the safety rotates over",
    "cover 3": "outside the curl/flat defender's drop — gets eyes back fast for the rhythm throw",
    man: "release flat — work to outleverage your defender for separation",
  },
  drag: {
    "cover 1": "vs man — find the rub off another route, accelerate after the cross",
    "cover 2": "shallow across underneath the two-deep safeties — sit in the window if zone",
    "cover 3": "shallow across — find the void between the dropping LBs",
    man: "rub-and-accelerate — the under-route gets the cleanest release",
  },
};

/** Public accessor for the Football Library routes page: the "how to run
 *  it" cue for a route family, plus any coverage-specific reads. Keyed the
 *  same way the narrator keys them internally (route family name, lowercased).
 *  Returns `cue: null` and an empty `byCoverage` for families with no cue. */
export function routeCoachingCues(routeName: string): {
  cue: string | null;
  byCoverage: Array<{ coverage: string; cue: string }>;
} {
  const key = routeName.toLowerCase();
  const cov = ROUTE_CUES_BY_COVERAGE[key];
  return {
    cue: ROUTE_CUES[key] ?? null,
    byCoverage: cov
      ? Object.entries(cov).map(([coverage, cue]) => ({ coverage, cue }))
      : [],
  };
}

const RUN_CUES: Record<NonNullable<Extract<AssignmentAction, { kind: "carry" }>["runType"]>, string> = {
  inside_zone: "press the LOS, read the first down-block, cut on the second LB's flow",
  outside_zone: "stretch wide, plant and bend back if the edge isn't sealed",
  power: "downhill behind the pulling guard, find the hole behind the kick-out",
  counter: "false step, then follow pullers to the back side",
  trap: "press into the hole, the trap block opens it late",
  draw: "delay then accelerate — read the rush lane",
  sweep: "wide path behind the pullers, set up the kick-out",
  qb_keep: "QB keeps and reads the unblocked edge",
  scramble: "find the lane outside the pocket",
};
