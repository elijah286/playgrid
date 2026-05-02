// Server-side validator for the play diagrams Cal emits as ```play fences.
// Runs after a turn that previously called place_defense — those are the
// high-stakes "matchup or full-defense" outputs where the most damaging
// errors have shown up (defenders missing, label collisions, the model
// silently moving safeties from where place_defense put them).
//
// The validator returns a list of human-readable error strings. The agent
// loop uses them to feed the model a one-shot critique and re-emit, so the
// coach never sees the broken render.

import { coachDiagramToPlaySpec } from "@/domain/play/specParser";
import {
  assertConcept,
  formatConceptViolations,
  parseConceptsFromText,
} from "@/domain/play/conceptMatch";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { lintProseAgainstSpec } from "./notes-lint";
import { validateRouteAssignments } from "./route-assignment-validate";

const OFFENSE_LETTERS = new Set([
  // Skill positions
  "QB", "C", "X", "Y", "Z", "H", "B", "F", "S", "TE",
  // Linemen
  "LT", "LG", "RG", "RT", "T", "G", "OL",
]);

type Player = { id: string; x: number; y: number; team?: "O" | "D" };
type DiagramRoute = {
  from?: string;
  path?: Array<[number, number]>;
  curve?: boolean;
};
type Diagram = {
  title?: string;
  variant?: string;
  players?: Player[];
  routes?: DiagramRoute[];
};

/**
 * Formation-name → required backfield-count constraint. When the diagram's
 * `title` (or the surrounding markdown's "## title" header) contains one
 * of the keywords for a constraint, the offensive layout MUST satisfy the
 * predicate. Catches "spread requested → Pro I drawn" failures.
 *
 * Backfield = non-QB offensive players placed at y < 0 (behind the LOS).
 */
type FormationConstraint = {
  keywords: string[];
  requireBackfield: { min: number; max: number };
  describe: string;
};

const FORMATION_CONSTRAINTS: FormationConstraint[] = [
  {
    keywords: ["spread", "5-wide", "five-wide", "empty"],
    requireBackfield: { min: 0, max: 1 },
    describe:
      "Spread / Empty formations have 0-1 non-QB backs in the backfield. " +
      "QB in shotgun, 4-5 receivers spread wide. 2+ backs in the backfield " +
      "means you drew Pro I / I-form / Singleback-with-FB, not Spread.",
  },
  {
    keywords: ["pro i", "pro-i", "i-form", "i form", "iform"],
    requireBackfield: { min: 2, max: 2 },
    describe:
      "Pro I / I-form has exactly 2 backs stacked behind a QB-under-center.",
  },
  {
    keywords: ["wishbone", "full house", "t-form"],
    requireBackfield: { min: 3, max: 3 },
    describe: "Wishbone / T-formation has 3 backs in the backfield (FB + 2 HBs).",
  },
  {
    keywords: ["singleback", "single-back", "single back", " ace "],
    requireBackfield: { min: 1, max: 1 },
    describe: "Singleback (Ace) has exactly 1 RB, QB under center.",
  },
];

const normalizeTitle = (s: string) =>
  ` ${s.toLowerCase().replace(/[^a-z0-9 \-]/g, " ").replace(/\s+/g, " ").trim()} `;

type PlaceDefenseSnapshot = {
  players: Array<{ id: string; x: number; y: number }>;
};

/** Snapshot of one place_offense return. Mirrors PlaceDefenseSnapshot.
 *  The validator uses this to catch the case where Cal calls
 *  place_offense but then silently repositions / renames / drops
 *  offensive players before emitting the diagram (which produces the
 *  malformed-OL bugs we keep chasing). */
type PlaceOffenseSnapshot = {
  players: Array<{ id: string; x: number; y: number }>;
};

/** Snapshot of one get_route_template call this turn. The validator uses
 *  these to verify Cal copied the tool result into the diagram instead of
 *  hand-authoring (the curl-bug class of failure). */
export type RouteTemplateSnapshot = {
  name: string;
  playerX: number;
  playerY: number;
  path: Array<[number, number]>;
  curve: boolean;
};

export function expectedFullCount(variant: string | null | undefined): number {
  switch (variant) {
    case "tackle_11": return 11;
    case "flag_5v5":  return 5;
    case "flag_7v7":  return 7;
    default:          return 7;
  }
}

function extractPlayFences(text: string): string[] {
  // Mirror PlayDiagramEmbed's fence detection. The model emits ```play\n{...}\n```.
  const fences: string[] = [];
  const re = /```play\s*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1].trim();
    if (body) fences.push(body);
  }
  return fences;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/** Phantom-write detection: write tools that Cal MUST have actually called
 *  this turn if the user-visible text claims the corresponding action
 *  succeeded. Maps a tool name to regexes that signal a success claim. */
const WRITE_CLAIM_PATTERNS: Array<{ tool: string; patterns: RegExp[] }> = [
  {
    tool: "create_playbook",
    patterns: [
      /\bplaybook\s+created\b/i,
      /\bcreated\s+(?:the\s+|your\s+)?playbook\b/i,
      /\[Open\s[^\]]+\]\(\/playbooks\/[0-9a-f-]{8,}\)/i,
    ],
  },
  {
    tool: "create_practice_plan",
    patterns: [
      /\bpractice\s+plan\s+(?:created|saved)\b/i,
      /\bcreated\s+(?:the\s+|your\s+)?practice\s+plan\b/i,
      /\[Open\s+practice\s+plan\]\(\/practice-plans\/[0-9a-f-]{8,}\)/i,
    ],
  },
  {
    tool: "create_play",
    patterns: [
      /\bplay\s+(?:created|saved|added)\b/i,
      /\bcreated\s+(?:the\s+)?play\b/i,
      /\bsaved\s+(?:the\s+)?play\b/i,
    ],
  },
  {
    tool: "create_event",
    patterns: [
      /\b(?:scheduled|added)\s+(?:the\s+)?(?:practice|game|scrimmage|event)\b/i,
      /\bevent\s+(?:created|added|scheduled)\b/i,
    ],
  },
];

export function validateDiagrams(opts: {
  text: string;
  variant: string | null | undefined;
  /** Most recent place_defense return, if any. Used to catch the model
   *  silently repositioning, renaming, or dropping defenders. */
  lastPlaceDefense: PlaceDefenseSnapshot | null;
  /** Most recent place_offense return, if any. Symmetric with
   *  lastPlaceDefense — catches Cal modifying offensive positions
   *  after calling place_offense (which previously had no snapshot
   *  check, so silent OL repositioning could ship undetected). */
  lastPlaceOffense?: PlaceOffenseSnapshot | null;
  /** Every get_route_template call from this turn. If non-empty, every
   *  route in the diagram must match one of these snapshots (path AND
   *  curve flag) — catches hand-authored named routes. */
  routeTemplates?: RouteTemplateSnapshot[];
  /** Names of write tools that ran successfully (ok:true) this turn.
   *  Used to detect phantom success claims — Cal can't say "playbook
   *  created" if create_playbook wasn't actually called. */
  writeToolsCalledOk?: ReadonlyArray<string>;
  /** True if place_offense ran successfully this turn. When the diagram
   *  has full offense (≥ variant count) and this is false, the validator
   *  flags a freelance and forces re-emit. */
  placeOffenseCalled?: boolean;
  /** True if place_defense ran successfully this turn. Same idea for
   *  full-defense diagrams. */
  placeDefenseCalled?: boolean;
}): ValidationResult {
  // ── Phantom-write detection ────────────────────────────────────
  // This runs FIRST and independently of diagram fences — Cal can claim a
  // playbook was created without emitting any ```play``` block, which used
  // to bypass validation entirely.
  const phantomErrors: string[] = [];
  const calledTools = new Set(opts.writeToolsCalledOk ?? []);
  for (const { tool, patterns } of WRITE_CLAIM_PATTERNS) {
    if (calledTools.has(tool)) continue;
    const hit = patterns.find((re) => re.test(opts.text));
    if (hit) {
      phantomErrors.push(
        `claimed "${tool}" success in your reply but never called the tool this turn (matched phrase "${hit.exec(opts.text)?.[0] ?? ""}"). The user will see broken state. Either call ${tool} now and re-emit, or remove the success claim entirely.`,
      );
    }
  }

  const fences = extractPlayFences(opts.text);
  if (fences.length === 0) {
    return phantomErrors.length === 0
      ? { ok: true }
      : { ok: false, errors: phantomErrors };
  }

  const errors: string[] = [...phantomErrors];
  const expected = expectedFullCount(opts.variant);

  for (let i = 0; i < fences.length; i++) {
    const tag = fences.length > 1 ? `Diagram ${i + 1}: ` : "";
    let json: Diagram;
    try {
      json = JSON.parse(fences[i]) as Diagram;
    } catch {
      errors.push(`${tag}diagram JSON failed to parse.`);
      continue;
    }
    const players = Array.isArray(json.players) ? json.players : [];
    const offense = players.filter((p) => p.team !== "D");
    const defense = players.filter((p) => p.team === "D");

    // OL-completeness AND OL-spacing check (tackle_11 FULL PLAYS only).
    // Every tackle_11 full play must:
    //   (a) include all 5 OL — LT, LG, C, RG, RT, AND
    //   (b) place them at DISTINCT x positions (within a 0.5yd tolerance).
    //
    // Coach surfaced 2026-05-02 that Cal hand-authored an "I-Form Flood
    // Right" and the linemen rendered STACKED (only LG and RT visible
    // because LT/C/RG were on top of them). Cal authored all 11 IDs
    // but at overlapping positions. The overlap resolver INTENTIONALLY
    // skips OL-OL pairs (real OL splits are tight 1-2yd), so it didn't
    // catch the hand-authored stack — only the synthesizer placement
    // (-4, -2, 0, 2, 4) is reliable. The validator now rejects hand-
    // authored OL with same x.
    //
    // Threshold: only fires when offense.length >= 7. Single-route
    // demos (≤ 6 offensive players) are intentionally minimal per
    // rule 9a — they're not "full plays" and don't need an OL row.
    // Tackle_11 only — flag variants have no OL.
    const variantStr = (typeof json.variant === "string" ? json.variant : opts.variant) ?? "";
    if (variantStr === "tackle_11" && offense.length >= 7) {
      const REQUIRED_OL = ["LT", "LG", "C", "RG", "RT"];
      const olPlayers = offense.filter((p) => {
        const id = typeof p.id === "string" ? p.id.toUpperCase() : "";
        return REQUIRED_OL.includes(id);
      });
      const olIds = new Set(olPlayers.map((p) => (p.id as string).toUpperCase()));
      const missing = REQUIRED_OL.filter((id) => !olIds.has(id));
      if (missing.length > 0) {
        errors.push(
          `${tag}tackle_11 play is missing required offensive linemen: ${missing.join(", ")}. ` +
          `Every tackle_11 full-play diagram MUST include all 5 OL (LT, LG, C, RG, RT). ` +
          `Hand-authoring positions drops linemen — instead, call \`place_offense\` to get the canonical formation layout, then layer routes on top by player ID.`,
        );
      } else {
        // All 5 OL present — verify they're at distinct x (no stacking).
        const xByOl = new Map<string, number>();
        for (const p of olPlayers) {
          const id = (p.id as string).toUpperCase();
          if (typeof p.x === "number") xByOl.set(id, Math.round(p.x * 2) / 2); // round to 0.5yd
        }
        const xCounts = new Map<number, string[]>();
        for (const [id, x] of xByOl) {
          const cur = xCounts.get(x) ?? [];
          cur.push(id);
          xCounts.set(x, cur);
        }
        const stackedGroups: string[] = [];
        for (const [x, ids] of xCounts) {
          if (ids.length > 1) stackedGroups.push(`{${ids.join(", ")}} at x=${x}`);
        }
        if (stackedGroups.length > 0) {
          errors.push(
            `${tag}tackle_11 OL is STACKED — multiple linemen at the same x: ${stackedGroups.join("; ")}. ` +
            `Canonical OL spacing is x=-4, -2, 0, 2, 4 (LT/LG/C/RG/RT). The overlap resolver intentionally skips OL pairs (real splits are tight), so hand-authored stacks aren't auto-fixed. ` +
            `Call \`place_offense({ formation: "<name>" })\` and copy its OL positions verbatim — never hand-author x for LT/LG/C/RG/RT. If a play has a non-default formation (I-Form, Pistol, Pro Set), \`place_offense\` still produces the correct OL row; the formation parameter only changes backs and receivers.`,
          );
        }
      }
    }

    // Formation-name vs layout consistency. If the diagram's title (or any
    // ## heading in the surrounding text) contains a formation keyword,
    // the offensive layout must satisfy that formation's structural rules.
    // Catches the "spread" → Pro I bug where Cal labeled the play correctly
    // but drew the wrong personnel grouping.
    const titleParts: string[] = [];
    if (typeof json.title === "string") titleParts.push(json.title);
    // Also scan H2 / H3 headings near the fence for the formation name.
    // Cal often emits "## Spread Slant vs 4-4" as the section header.
    const headingMatches = opts.text.match(/^#{1,3}\s+.+$/gm);
    if (headingMatches) titleParts.push(...headingMatches);
    const titleHaystack = normalizeTitle(titleParts.join(" "));

    if (titleHaystack.trim()) {
      // Count non-QB offensive backs (y < 0, team=O, id != QB/Q/Center).
      const isLineman = (id: string): boolean =>
        ["LT", "LG", "C", "RG", "RT", "T", "G", "OL"].includes(id.toUpperCase());
      const isQB = (id: string): boolean => {
        const u = id.toUpperCase();
        return u === "QB" || u === "Q";
      };
      const backfieldCount = offense.filter(
        (p) => p.y < 0 && !isQB(p.id) && !isLineman(p.id),
      ).length;

      for (const c of FORMATION_CONSTRAINTS) {
        const matched = c.keywords.find((kw) => titleHaystack.includes(` ${kw.toLowerCase()} `));
        if (!matched) continue;
        if (
          backfieldCount < c.requireBackfield.min ||
          backfieldCount > c.requireBackfield.max
        ) {
          const range = c.requireBackfield.min === c.requireBackfield.max
            ? String(c.requireBackfield.min)
            : `${c.requireBackfield.min}-${c.requireBackfield.max}`;
          errors.push(
            `${tag}title says "${matched}" but the diagram has ${backfieldCount} non-QB back(s) in the backfield (need ${range}). ${c.describe}`,
          );
        }
      }
    }

    // Defense-included diagrams must hit the variant's full count.
    if (defense.length > 0 && defense.length !== expected) {
      errors.push(
        `${tag}defense has ${defense.length} player(s); expected ${expected} for this variant.`,
      );
    }

    // Offense diagrams should also be full when not a single-route bucket.
    // Heuristic: if there's any defense at all, treat it as a play/scheme/matchup
    // diagram and require the full offense count too. (Single-route diagrams
    // place ONE defender by hand — and the agent prompt allows that path
    // without place_defense, so they'll never reach this validator anyway.)
    if (defense.length > 0 && offense.length !== expected) {
      errors.push(
        `${tag}offense has ${offense.length} player(s); expected ${expected} for this variant.`,
      );
    }

    // Mandatory-placement gate. If the diagram includes a full side, the
    // corresponding place_offense / place_defense tool MUST have run this
    // turn. Catches the freelance-formation failures (Spread requested
    // and drawn as a tight 2-back set with stacked players, etc.). The
    // tool is the one piece guaranteed to produce structurally-correct
    // coordinates from a name; skipping it is the root cause of every
    // overlap / wrong-look bug we've debugged.
    if (offense.length >= expected && !opts.placeOffenseCalled) {
      errors.push(
        `${tag}offensive layout has ${offense.length} players but place_offense was NOT called this turn. Hand-authoring offense produces stacked players, wrong splits, and formation-name mismatches. Call place_offense({ formation: "<name>" }) and copy its players verbatim.`,
      );
    }
    if (defense.length >= expected && !opts.placeDefenseCalled) {
      errors.push(
        `${tag}defensive layout has ${defense.length} players but place_defense was NOT called this turn. Call place_defense({ front: "<name>", coverage: "<name>" }) and copy its players + zones verbatim.`,
      );
    }

    // Skill-player route coverage. Pass plays MUST give every offensive
    // skill player (X / Y / Z / H / S / TE / WR-ish) either a route OR
    // an explicit blocking marker. Forgetting one receiver is a common
    // failure mode the coach catches mid-review.
    const titleHay = (typeof json.title === "string" ? json.title : "").toLowerCase();
    const isPassPlay = /\b(slant|hitch|out|in|post|corner|curl|comeback|fade|flat|mesh|smash|stick|snag|levels|drive|y-?cross|four\s*verts|sail|flood|pass|drop\s*back|rpo)\b/.test(titleHay);
    const SKILL_LABELS = new Set(["X", "Y", "Z", "H", "S", "F", "B", "TE"]);
    if (isPassPlay && Array.isArray(json.routes)) {
      const routedFroms = new Set(
        json.routes
          .filter((r): r is DiagramRoute => !!r && typeof r === "object")
          .map((r) => (typeof r.from === "string" ? r.from : ""))
          .filter(Boolean),
      );
      const missing: string[] = [];
      for (const p of offense) {
        const upper = p.id.toUpperCase();
        // Strip numeric suffix (Z2 → Z) for the skill check.
        const base = upper.replace(/\d+$/, "");
        if (!SKILL_LABELS.has(base)) continue;
        if (upper === "QB" || upper === "Q") continue;
        if (!routedFroms.has(p.id)) missing.push(p.id);
      }
      if (missing.length > 0) {
        errors.push(
          `${tag}pass play has skill player(s) without a route: ${missing.join(", ")}. Every offensive skill player in a pass concept must have a route OR be explicitly tagged as a blocker. Either add the missing route(s) (use get_route_template + the RB swing/check or a blocker label) or remove those players from the diagram.`,
        );
      }
    }

    // Defender labels must not reuse offensive letters.
    for (const d of defense) {
      if (typeof d.id === "string" && OFFENSE_LETTERS.has(d.id)) {
        errors.push(
          `${tag}defender labeled "${d.id}" reuses an offensive letter — defender ids must come from place_defense's return.`,
        );
      }
    }

    // No two players may share the same (x, y).
    const seen = new Map<string, string>();
    for (const p of players) {
      const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      const prior = seen.get(key);
      if (prior) {
        errors.push(`${tag}players "${prior}" and "${p.id}" overlap at (${p.x}, ${p.y}).`);
      } else {
        seen.set(key, p.id);
      }
    }

    // Player ids must be unique within the diagram. Reusing the same id
    // (e.g. two players both labeled "Z" in 4-wide) silently collapses
    // their routes onto the first carrier, producing the "common anchor"
    // bug. Force a suffix (Z, Z2) so each player has its own handle.
    const idCounts = new Map<string, number>();
    for (const p of players) {
      if (typeof p.id !== "string") continue;
      idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1);
    }
    for (const [id, n] of idCounts) {
      if (n > 1) {
        errors.push(
          `${tag}player id "${id}" appears ${n} times — every player needs a unique id. ` +
          `When two share a position letter (twins, two Zs in 4-wide, etc.), suffix the second one (e.g. "Z" and "Z2") and reference that exact id in routes.`,
        );
      }
    }

    // ── Prose ↔ diagram-derived spec consistency ─────────────────
    //
    // Cal's free-form chat prose ("hit @X on the post, work @H2 on the
    // curl") was previously unchecked — the lint pass only ran at
    // update_play_notes save time, so the in-chat preview could
    // describe a player's route as one family while the diagram showed
    // another. Surfaced 2026-05-02: prose said "@H crossing
    // underneath" but the diagram had @H going vertical.
    //
    // Now: derive a spec from the diagram fence, then lint the
    // surrounding prose for ACTIVE family contradictions per @Player
    // reference. Conservative — silent paraphrasing passes; only
    // "@X on the post" when X has Slant fails. Forces Cal to either
    // fix the prose or fix the diagram before the coach sees either.
    //
    // Also: when Cal NAMES a concept (curl-flat, smash, mesh, stick,
    // snag, four-verts) in the title or prose, the spec must satisfy
    // the concept's tighter depth/family requirements. Catches the
    // "Curl/Flat with a 10yd curl" case from 2026-05-02 — the
    // catalog Curl is 8-13yd but the curl-flat CONCEPT requires 4-7yd.
    if (Array.isArray(json.routes) && json.routes.length > 0) {
      try {
        const derived = coachDiagramToPlaySpec(json as CoachDiagram, {
          variant: opts.variant as "tackle_11" | "flag_7v7" | "flag_5v5" | undefined,
        });
        const proseLint = lintProseAgainstSpec(opts.text, derived);
        if (!proseLint.ok) {
          for (const issue of proseLint.issues) {
            errors.push(
              `${tag}prose says @${issue.player} runs a "${issue.notesFamily}" but the diagram has @${issue.player} on a "${issue.expectedFamily}". ` +
              `Fix the prose to match the diagram (or fix the diagram + route_kind to match the prose). ` +
              `Sentence: ${JSON.stringify(issue.bullet.slice(0, 160))}`,
            );
          }
        }

        // Concept assertion. Scan the diagram title + prose for any
        // catalog concept name; for each one found, the derived spec
        // must satisfy that concept's required pattern. The narrowed
        // depth ranges in concepts catch the "called it curl-flat
        // but the curl is 10yd" failure mode the family-only lint
        // can't see.
        const conceptScanText = `${json.title ?? ""}\n${opts.text}`;
        const claimedConcepts = parseConceptsFromText(conceptScanText);
        for (const conceptName of claimedConcepts) {
          const result = assertConcept(derived, conceptName);
          if (!result.ok) {
            errors.push(
              `${tag}${formatConceptViolations(conceptName, result.violations)}`,
            );
            continue;
          }
          // Family + depth match passed. Now check structural
          // constraints that depend on rendered POSITIONS — currently
          // just sameSideRequired (Flood / Sail), but designed to
          // extend (e.g. "stack-must-be-3x1", "trips-strong" etc).
          //
          // sameSide check uses route ENDPOINTS, not player starting
          // positions. Coaches care about WHERE the route ends (where
          // the QB throws). An RB-flat from a backfield-left start
          // ENDS on the strong side — that's valid Flood Right even
          // though the RB starts at x=-4. Surfaced 2026-05-02 when a
          // Spread Doubles Flood Right with B running a strong-side
          // swing was incorrectly rejected because B started left.
          if (result.concept.sameSideRequired) {
            const routesByCarrier = new Map<string, [number, number][]>();
            for (const r of (json.routes ?? []) as Array<{ from?: unknown; path?: unknown }>) {
              if (typeof r.from !== "string" || !Array.isArray(r.path)) continue;
              if (!result.usedPlayers.has(r.from)) continue;
              const path = r.path as [number, number][];
              if (path.length === 0) continue;
              routesByCarrier.set(r.from, path);
            }
            const endpointsByCarrier: Array<{ id: string; endX: number }> = [];
            for (const [carrier, path] of routesByCarrier.entries()) {
              const last = path[path.length - 1];
              if (Array.isArray(last) && typeof last[0] === "number") {
                endpointsByCarrier.push({ id: carrier, endX: last[0] });
              }
            }
            const left  = endpointsByCarrier.filter((p) => p.endX < 0).length;
            const right = endpointsByCarrier.filter((p) => p.endX > 0).length;
            if (left > 0 && right > 0) {
              const sideSummary = endpointsByCarrier
                .map((p) => `@${p.id} ends at x=${p.endX}`)
                .join(", ");
              errors.push(
                `${tag}Concept "${conceptName}" is a SIDE-FLOODING concept — every required route MUST END on the same side of the formation (all endpoints x > 0 or all x < 0). ` +
                `Matched routes end on both sides: ${sideSummary}. ` +
                `Adjust route waypoints so all 3 routes finish on the same side: "${conceptName} Right" → all endpoints x > 0; "${conceptName} Left" → all endpoints x < 0. ` +
                `Don't re-emit the same play with the same name unless the route endpoints are all on the same side.`,
              );
            }
          }
        }

        // Geometry-vs-family validation. validateRouteAssignments
        // checks that every route with a declared route_kind has
        // depth + side consistent with the catalog template. Used
        // to only run at SAVE time (recordPlayVersion); now also
        // runs at chat-time so a "12-yard slant" route_kind="Slant"
        // gets caught before the coach sees the broken diagram.
        // 2026-05-02 surfaced: Cal's chat showed "X runs a slant" on
        // a route with 12yd depth — the SAVE validator would have
        // caught it if Cal saved, but the chat preview didn't.
        const routeAssignmentLint = validateRouteAssignments(json as CoachDiagram);
        if (!routeAssignmentLint.ok) {
          for (const issue of routeAssignmentLint.errors) {
            errors.push(
              `${tag}@${issue.carrier}: declared route_kind="${issue.declaredKind}" — ${issue.message}`,
            );
          }
        }

        // Prose-completeness check. Every offensive player WITH A
        // ROUTE in the diagram must be mentioned by @Label somewhere
        // in the surrounding prose. Catches the "Cal forgot to
        // describe @Z" failure mode (2026-05-02): the diagram
        // shows Z running a vertical, but the prose narrates only
        // X / B / H / S — Z's existence is invisible to a coach
        // reading the play.
        //
        // Conservative: only fires when a player has a NON-block
        // route in the spec (blockers don't need prose mention).
        // Linemen (LT/LG/C/RG/RT) and the QB are exempt — their
        // jobs are implied.
        const proseRefs = new Set<string>();
        const refRe = /@([A-Za-z][A-Za-z0-9]{0,3})\b/g;
        let m: RegExpExecArray | null;
        while ((m = refRe.exec(opts.text)) !== null) {
          proseRefs.add(m[1].toUpperCase());
        }
        const defenderIds = new Set<string>();
        for (const p of players) {
          if (p.team === "D") defenderIds.add(p.id);
        }
        const skillRouteCarriers: string[] = [];
        for (const r of json.routes ?? []) {
          if (!r || typeof r.from !== "string") continue;
          if (defenderIds.has(r.from)) continue;
          // Skip linemen / QB — their routes are blocking + drop, not
          // pass routes that need prose narration.
          const u = r.from.toUpperCase();
          if (["LT", "LG", "C", "RG", "RT", "T", "G", "OL"].includes(u)) continue;
          if (u === "QB" || u === "Q") continue;
          skillRouteCarriers.push(r.from);
        }
        const omitted = skillRouteCarriers.filter((id) => !proseRefs.has(id.toUpperCase()));
        if (omitted.length > 0) {
          errors.push(
            `${tag}prose omits ${omitted.length} player(s) with routes: ${omitted.map((p) => `@${p}`).join(", ")}. ` +
            `Every skill-position player whose route is on the diagram must be mentioned by @Label in the prose so the coach knows what they do. ` +
            `Add a sentence describing each omitted player's role (e.g. "@${omitted[0]} clears out the deep zone", "@${omitted[0]} is the safety valve").`,
          );
        }
      } catch {
        // Spec derivation can fail on edge cases (oddly-shaped diagrams);
        // a lint we can't run is preferable to a hard validation crash.
      }
    }

    // ── Named-route compliance ────────────────────────────────────
    //
    // If get_route_template was called THIS TURN, every route in the
    // diagram authored by an OFFENSIVE player should match one of those
    // snapshots. Catches the "Cal hand-authored a curl as a vertical
    // line" failure mode.
    //
    // Defender routes are intentionally excluded — Cal hand-authors
    // those (zone reposition / man tracking) and they're not named
    // template routes.
    const snapshots = opts.routeTemplates ?? [];
    // Allow Cal to escape the named-route check by explicitly labeling
    // "(custom route)" in the surrounding prose — that's the documented
    // escape hatch in the agent prompt for genuinely off-template routes.
    const customRouteLabeled = /\(custom route\)/i.test(opts.text);
    if (Array.isArray(json.routes) && json.routes.length > 0) {
      const playerById = new Map<string, Player>();
      for (const p of players) playerById.set(p.id, p);

      for (const route of json.routes) {
        if (!route || typeof route !== "object") continue;
        const from = typeof route.from === "string" ? route.from : null;
        if (!from) continue;
        const player = playerById.get(from);
        if (!player) continue;
        if (player.team === "D") continue; // skip defender movement
        const path = Array.isArray(route.path) ? route.path : [];
        if (path.length === 0) continue;

        // Find closest snapshot by player position (within 1.5 yds).
        let best: { snap: RouteTemplateSnapshot; dist: number } | null = null;
        for (const s of snapshots) {
          const dist = Math.hypot(s.playerX - player.x, s.playerY - player.y);
          if (!best || dist < best.dist) best = { snap: s, dist };
        }
        if (!best || best.dist > 1.5) {
          // No template snapshot near this player. If the path is non-
          // trivial (≥2 waypoints), this looks like a hand-authored named
          // route — flag it. Single-waypoint paths are likely simple
          // custom routes (drag, flat, swing) — allow those.
          //
          // Cal can escape the check by labeling "(custom route)" in the
          // surrounding prose for genuinely off-catalog shapes.
          if (path.length >= 2 && !customRouteLabeled) {
            errors.push(
              `${tag}route from "${from}" was hand-authored (${path.length} waypoints) but no get_route_template was called for this route. Named routes (Slant, Post, Curl, Hitch, Out, In, Corner, Dig, etc.) MUST come from get_route_template — copy its \`path\` and \`curve\` verbatim. If this is genuinely a custom shape, write "(custom route)" in your prose to acknowledge it's off-catalog.`,
            );
          }
          continue;
        }

        // Verify path waypoints match the snapshot.
        const expected = best.snap.path;
        if (path.length !== expected.length) {
          errors.push(
            `${tag}route from "${from}" has ${path.length} waypoint(s); get_route_template for "${best.snap.name}" returned ${expected.length}. Use the tool's path verbatim.`,
          );
          continue;
        }
        const mismatch = path.some((wp, idx) => {
          const ex = expected[idx];
          if (!Array.isArray(wp) || wp.length < 2 || !Array.isArray(ex)) return true;
          return Math.abs(wp[0] - ex[0]) > 1.5 || Math.abs(wp[1] - ex[1]) > 1.5;
        });
        if (mismatch) {
          errors.push(
            `${tag}route from "${from}" path doesn't match get_route_template's "${best.snap.name}" output. Tool returned ${JSON.stringify(expected)}; diagram has ${JSON.stringify(path)}. Use the tool's path verbatim.`,
          );
        }
        // Verify curve flag matches.
        const diagramCurve = route.curve === true;
        if (diagramCurve !== best.snap.curve) {
          errors.push(
            `${tag}route from "${from}" has curve=${diagramCurve}, but get_route_template's "${best.snap.name}" returned curve=${best.snap.curve}. A ${best.snap.curve ? "rounded" : "sharp"} route drawn ${diagramCurve ? "rounded" : "sharp"} renders wrong (curl as straight line, slant as arc).`,
          );
        }
      }
    }

    // If place_offense ran this turn, the diagram's offense must match
    // what it returned (no silent repositioning, renaming, or dropping).
    // Mirror of the place_defense block below — catches the LT-on-LG
    // class of bug where Cal called place_offense but then nudged a
    // lineman without using the canonical position.
    if (opts.lastPlaceOffense && offense.length > 0) {
      const expectedById = new Map<string, { count: number; positions: Array<{ x: number; y: number }> }>();
      for (const ep of opts.lastPlaceOffense.players) {
        const cur = expectedById.get(ep.id);
        if (cur) {
          cur.count += 1;
          cur.positions.push({ x: ep.x, y: ep.y });
        } else {
          expectedById.set(ep.id, { count: 1, positions: [{ x: ep.x, y: ep.y }] });
        }
      }
      const seenIds = new Map<string, number>();
      for (const o of offense) seenIds.set(o.id, (seenIds.get(o.id) ?? 0) + 1);
      for (const [id, info] of expectedById) {
        const actual = seenIds.get(id) ?? 0;
        if (actual < info.count) {
          errors.push(
            `${tag}offensive player "${id}" missing — place_offense returned ${info.count} of them, diagram has ${actual}. ` +
            `Copy place_offense's players verbatim — modifying or omitting any breaks the formation.`,
          );
        }
      }
      // Position drift: per-id, every actual must be close to one expected.
      for (const o of offense) {
        const info = expectedById.get(o.id);
        if (!info) continue;
        const close = info.positions.some(
          (e) => Math.abs(e.x - o.x) <= 0.5 && Math.abs(e.y - o.y) <= 0.5,
        );
        if (!close) {
          errors.push(
            `${tag}offensive player "${o.id}" repositioned from place_offense's output (now at ${o.x},${o.y}). ` +
            `Don't hand-tune — call place_offense with the right formation name and copy verbatim.`,
          );
        }
      }
    }

    // If place_defense ran this turn, the diagram's defense must match what
    // it returned (no silent repositioning, renaming, or dropping).
    if (opts.lastPlaceDefense && defense.length > 0) {
      const expectedById = new Map<string, { count: number; positions: Array<{ x: number; y: number }> }>();
      for (const ep of opts.lastPlaceDefense.players) {
        const cur = expectedById.get(ep.id);
        if (cur) {
          cur.count += 1;
          cur.positions.push({ x: ep.x, y: ep.y });
        } else {
          expectedById.set(ep.id, { count: 1, positions: [{ x: ep.x, y: ep.y }] });
        }
      }
      const seenIds = new Map<string, number>();
      for (const d of defense) {
        seenIds.set(d.id, (seenIds.get(d.id) ?? 0) + 1);
      }
      for (const [id, info] of expectedById) {
        const actual = seenIds.get(id) ?? 0;
        if (actual < info.count) {
          errors.push(
            `${tag}defender "${id}" missing — place_defense returned ${info.count} of them, diagram has ${actual}.`,
          );
        }
      }
      // Position drift: for each defender id, every actual position must be
      // close to one of place_defense's expected positions for that id.
      for (const d of defense) {
        const info = expectedById.get(d.id);
        if (!info) continue; // count/label error already reported above
        const close = info.positions.some(
          (e) => Math.abs(e.x - d.x) <= 0.5 && Math.abs(e.y - d.y) <= 0.5,
        );
        if (!close) {
          errors.push(
            `${tag}defender "${d.id}" repositioned from place_defense's output (now at ${d.x},${d.y}).`,
          );
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
