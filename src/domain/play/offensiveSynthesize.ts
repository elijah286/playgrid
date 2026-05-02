/**
 * Offensive-formation synthesizer — the offensive counterpart to
 * defensiveSynthesize.ts. Produces a structurally-correct player layout
 * for a named offensive formation when (a) the KB doesn't have an exact
 * entry, or (b) the model needs canonical coordinates rather than a
 * prose description.
 *
 * Strategy: parse the formation name into a STRUCTURAL spec (QB depth,
 * backs in the backfield, receiver distribution, TE on/off line), then
 * place players at canonical x/y. Total count is enforced to match the
 * variant (tackle_11 → 11, flag_7v7 → 7, flag_5v5 → 5).
 *
 * Coordinate system:
 *   x = yards from the center of the field (negative = LEFT, positive = RIGHT)
 *   y = yards from the LOS (0 = on the line, negative = backfield, positive = downfield)
 */

export type SynthOffensePlayer = {
  id: string;
  x: number;
  y: number;
};

export type SynthOffense = {
  formation: string;
  variant: "tackle_11" | "flag_7v7" | "flag_5v5";
  description: string;
  players: SynthOffensePlayer[];
  /** True if the synthesizer is confident the layout matches the requested
   *  formation; false when we fell back to a generic Spread Doubles. */
  exactMatch: boolean;
};

/* ------------------------------------------------------------------ */
/*  Structural spec                                                    */
/* ------------------------------------------------------------------ */

type QBDepth =
  | "under_center"   // y = -1 (just behind C)
  | "pistol"         // y ≈ -4
  | "shotgun";       // y ≈ -5

type BackArrangement =
  | "none"           // empty backfield (Spread/Empty)
  | "single"         // 1 back beside or behind the QB
  | "i_stack"        // FB at -3, HB at -5 (Pro I / I-form)
  | "wishbone"       // FB at -3 + 2 HBs at -5 split outside FB (Y shape)
  | "t_row"          // 3 backs in a flat row at -4
  | "split";         // 2 backs split (one each side of QB)

type ReceiverDistribution =
  | { left: number; right: number; te: 0 | 1; bunchSide?: "left" | "right" | null };

type FormationSpec = {
  qb: QBDepth;
  backs: BackArrangement;
  receivers: ReceiverDistribution;
  /** Strength side. Inverts left/right counts on receivers + flips TE side. */
  strength: "left" | "right";
  /** Optional human-readable disambiguation ("Trips Right", "Pro I Strong Left"). */
  derivedName: string;
};

/* ------------------------------------------------------------------ */
/*  Parse                                                              */
/* ------------------------------------------------------------------ */

const STRENGTH_RE = /\b(strong|right|to the right)\b|\b(weak|left|to the left)\b/i;

function parseStrength(raw: string): "left" | "right" | null {
  const m = STRENGTH_RE.exec(raw);
  if (!m) return null;
  return m[1] ? "right" : "left";
}

/**
 * Best-effort parse of an offensive formation name into a structural spec.
 * Returns null when the name is too vague to map confidently — caller can
 * decide whether to default to Spread Doubles or surface an error.
 */
export function parseFormationName(rawInput: string): FormationSpec | null {
  const raw = rawInput.toLowerCase().trim();
  if (!raw) return null;

  const strength = parseStrength(raw) ?? "right";
  const has = (kw: string) => raw.includes(kw);
  const matches = (re: RegExp) => re.test(raw);

  // Empty / 5-wide — zero backs.
  if (matches(/\b(empty|5[\s-]?wide|five[\s-]?wide|00\s*personnel)\b/)) {
    return {
      qb: "shotgun",
      backs: "none",
      receivers: { left: 2, right: 3, te: 0 },
      strength,
      derivedName: "Empty (5-wide)",
    };
  }

  // Wishbone — 3 backs in a Y.
  if (has("wishbone") || has("bone")) {
    return {
      qb: "under_center",
      backs: "wishbone",
      receivers: { left: 1, right: 1, te: 1 },
      strength,
      derivedName: "Wishbone",
    };
  }

  // T-formation / Full House — 3 backs in a row.
  if (matches(/\b(t[\s-]?form(ation)?|full[\s-]?house)\b/)) {
    return {
      qb: "under_center",
      backs: "t_row",
      receivers: { left: 1, right: 1, te: 1 },
      strength,
      derivedName: "T-formation",
    };
  }

  // Pro I / I-form — 2 backs stacked, QB under center.
  if (matches(/\b(pro\s*i|i[\s-]?form|i[\s-]?formation)\b/)) {
    return {
      qb: "under_center",
      backs: "i_stack",
      receivers: { left: 1, right: 1, te: 1 },
      strength,
      derivedName: "Pro I",
    };
  }

  // Split-back / Pro Set (2 backs side-by-side).
  if (matches(/\bsplit[\s-]?back(s)?\b|\bpro[\s-]?set\b/)) {
    return {
      qb: "under_center",
      backs: "split",
      receivers: { left: 1, right: 1, te: 1 },
      strength,
      derivedName: "Split backs",
    };
  }

  // Pistol — QB at -4, 1 back behind QB.
  if (has("pistol")) {
    return {
      qb: "pistol",
      backs: "single",
      receivers: { left: 2, right: 1, te: 1 },
      strength,
      derivedName: "Pistol",
    };
  }

  // Singleback / Ace — QB under center, 1 RB at -5.
  if (matches(/\b(single[\s-]?back|ace)\b/)) {
    return {
      qb: "under_center",
      backs: "single",
      receivers: { left: 1, right: 2, te: 1 },
      strength,
      derivedName: "Singleback",
    };
  }

  // Trips (3x1) — three receivers one side, one backside.
  if (matches(/\btrips\b/)) {
    return {
      qb: "shotgun",
      backs: "single",
      receivers:
        strength === "right"
          ? { left: 1, right: 3, te: 0 }
          : { left: 3, right: 1, te: 0 },
      strength,
      derivedName: `Trips ${strength === "right" ? "Right" : "Left"}`,
    };
  }

  // Doubles (2x2) — two each side, 1 back, shotgun.
  if (matches(/\bdoubles\b|\b2[\sx-]?2\b/)) {
    return {
      qb: "shotgun",
      backs: "single",
      receivers: { left: 2, right: 2, te: 0 },
      strength,
      derivedName: "Doubles (2x2)",
    };
  }

  // Twins — two receivers stacked or side-by-side on one side.
  if (has("twins")) {
    return {
      qb: "shotgun",
      backs: "single",
      receivers:
        strength === "right"
          ? { left: 1, right: 2, te: 1 }
          : { left: 2, right: 1, te: 1 },
      strength,
      derivedName: `Twins ${strength === "right" ? "Right" : "Left"}`,
    };
  }

  // Bunch — 3 receivers tight to one side.
  if (has("bunch")) {
    return {
      qb: "shotgun",
      backs: "single",
      receivers:
        strength === "right"
          ? { left: 1, right: 3, te: 0, bunchSide: "right" }
          : { left: 3, right: 1, te: 0, bunchSide: "left" },
      strength,
      derivedName: `Bunch ${strength === "right" ? "Right" : "Left"}`,
    };
  }

  // Stack — same as bunch but vertically stacked. Treat as bunch geometry.
  if (has("stack")) {
    return {
      qb: "shotgun",
      backs: "single",
      receivers:
        strength === "right"
          ? { left: 1, right: 3, te: 0, bunchSide: "right" }
          : { left: 3, right: 1, te: 0, bunchSide: "left" },
      strength,
      derivedName: `Stack ${strength === "right" ? "Right" : "Left"}`,
    };
  }

  // Spread (umbrella) — default to Doubles for younger teams.
  if (has("spread")) {
    return {
      qb: "shotgun",
      backs: "single",
      receivers: { left: 2, right: 2, te: 0 },
      strength,
      derivedName: "Spread Doubles (2x2)",
    };
  }

  // Shotgun (no other modifier) — generic 1-back shotgun.
  if (has("shotgun")) {
    return {
      qb: "shotgun",
      backs: "single",
      receivers: { left: 2, right: 2, te: 0 },
      strength,
      derivedName: "Shotgun",
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Place                                                              */
/* ------------------------------------------------------------------ */

function placeQB(qb: QBDepth): SynthOffensePlayer {
  switch (qb) {
    case "under_center": return { id: "QB", x: 0, y: -1 };
    case "pistol":       return { id: "QB", x: 0, y: -4 };
    case "shotgun":      return { id: "QB", x: 0, y: -5 };
  }
}

function placeBacks(arr: BackArrangement): SynthOffensePlayer[] {
  switch (arr) {
    case "none": return [];
    case "single":
      // 1 back beside the QB. 4 yards offset so they're clearly separate
      // tokens (2 yards rendered as overlap due to circle radius).
      return [{ id: "B", x: -4, y: -5 }];
    case "i_stack":
      return [
        { id: "F", x: 0, y: -3 },   // FB
        { id: "B", x: 0, y: -6 },   // HB
      ];
    case "wishbone":
      return [
        { id: "F", x:  0, y: -3 },  // FB centered
        { id: "B", x: -4, y: -5 },  // weak HB
        { id: "H", x:  4, y: -5 },  // strong HB
      ];
    case "t_row":
      return [
        { id: "F", x:  0, y: -4 },
        { id: "B", x: -4, y: -4 },
        { id: "H", x:  4, y: -4 },
      ];
    case "split":
      return [
        { id: "F", x: -4, y: -5 },
        { id: "B", x:  4, y: -5 },
      ];
  }
}

/**
 * Place receivers across the formation. Returns 4 receivers maximum
 * (X/Y/Z/H/S labels — Y/H are flexible inside, X/Z are outside).
 *
 * Rules:
 *   - X = farthest outside left
 *   - Z = farthest outside right
 *   - Y = TE position (just outside the strong-side tackle, ON the line)
 *         OR a slot/inside receiver when te=0
 *   - H/S = additional inside receivers on the strong side (slots)
 */
function placeReceivers(
  rec: ReceiverDistribution,
  variant: SynthOffense["variant"],
): SynthOffensePlayer[] {
  const players: SynthOffensePlayer[] = [];

  // Field-width-aware outer-receiver x-positions. Tackle is 53 yds wide
  // so true Spread WRs split to ~18-22 yds from center. Flag is narrower
  // (30 yds for 7v7, 25 for 5v5) so splits are correspondingly tighter.
  // Slots stand ~5-6 yards inside the outer receiver, well off the OL.
  const wideX = variant === "tackle_11" ? 18 : variant === "flag_7v7" ? 12 : 10;

  // Slot-letter allocator. Per the KB (rag_documents:conventions/
  // offense_labels for tackle_11): "Tackle 11 — Offensive personnel
  // labels (X / Y / Z / H / F / T / Q)" — distinct LETTERS per role,
  // not numeric suffixes. Old code returned "H" for both left-side
  // and right-side slots in 2x2 doubles, then a downstream dedup
  // pass appended a "2" producing "H + H2" — which a coach correctly
  // flagged 2026-05-02 as not matching any league convention.
  //
  // Pool order ["H", "S", "F"] preserves the existing convention for
  // trips right (Z + H + S) and adds F for the cross-side slot in
  // doubles (X H | Z F).
  const slotPool = ["H", "S", "F"];
  let slotIdx = 0;
  const nextSlot = (): string => {
    const letter = slotPool[slotIdx] ?? `S${slotIdx + 1}`;
    slotIdx += 1;
    return letter;
  };
  const labelFor = (side: "left" | "right", index: number, te: boolean): string => {
    if (side === "left") {
      return index === 0 ? "X" : nextSlot();
    }
    if (te && index === 0) return "Y";
    if (index === 0) return "Z";
    return nextSlot();
  };

  // LEFT side. Outermost is on the line at y=0; subsequent slots step
  // inward and OFF the line (y=-1). Inside-step is large enough that
  // adjacent receivers don't visually overlap (~7 yards for tackle, less
  // for flag).
  const insideStepLeft = variant === "tackle_11" ? 7 : variant === "flag_7v7" ? 5 : 4;
  for (let i = 0; i < rec.left; i++) {
    const x = -(wideX - i * insideStepLeft) + (i > 0 && rec.bunchSide === "left" ? 3 : 0);
    const onLine = i === 0;
    const y = onLine ? 0 : -1;
    players.push({ id: labelFor("left", i, false), x: clampSlotXAwayFromOL(x, onLine, variant), y });
  }

  // RIGHT side. If te=1 the TE (Y) goes ON the line just outside RT;
  // rec.right then counts WRs IN ADDITION to the TE — so a formation
  // like Pro Set (1 left WR, 1 TE, 1 right WR) is { left: 1, right: 1,
  // te: 1 } and produces X + Y + Z (3 right-side spots).
  //
  // Earlier the TE consumed one of rec.right's slots, which silently
  // dropped Z whenever te=1 + right=1 (Pro Set, Pro I, I-form). The
  // saved play came back with only 10 players for tackle_11 and the
  // thumbnail rendered as a misshapen field. See the player-count
  // integrity guard in specRenderer for the matching defensive check.
  const teRight = rec.te === 1;
  if (teRight) {
    const yX = variant === "tackle_11" ? 6 : variant === "flag_7v7" ? 5 : 4;
    players.push({ id: "Y", x: yX, y: 0 });
  }
  const insideStepRight = insideStepLeft;
  for (let i = 0; i < rec.right; i++) {
    // baseX accounts for the TE-occupied slot at the inside-most
    // position when te=1: WRs step further outward to leave room.
    const baseX = i === 0 ? wideX : wideX - (i + (teRight ? 1 : 0)) * insideStepRight;
    const x = baseX + (i > 0 && rec.bunchSide === "right" ? -3 : 0);
    // Outermost WR (i=0) is always on the line at the sideline. Slots
    // (i>0) are off the line. The TE (when present) is on the line at
    // the inside x — both X-side WR and TE on the line on the right is
    // legal (two split-end-style attached/wide receivers).
    const onLine = i === 0;
    const y = onLine ? 0 : -1;
    players.push({ id: labelFor("right", i, false), x: clampSlotXAwayFromOL(x, onLine, variant), y });
  }

  return players;
}

/**
 * Clamp a synthesized slot's x-position so it stays clear of the OL
 * row. For tackle_11, the OL spans x=[-4, +4]; an inner-most slot in
 * Trips (rec.left=3 or rec.right=3) lands at exactly x=±4 from the
 * natural formula `wideX - 2*insideStep = 18 - 14 = 4`, putting the
 * slot directly above/below LT or RT and producing an overlap-resolver
 * failure ("S and H overlap" — surfaced 2026-05-02). Push slots out by
 * 2yd minimum so they sit OUTSIDE the OL row, where the resolver can
 * separate them cleanly. Outermost WRs (onLine=true) are at x=±18 and
 * never need clamping; the OL itself isn't routed through this helper.
 *
 * Flag variants don't have an OL, so no clamping needed.
 */
function clampSlotXAwayFromOL(x: number, onLine: boolean, variant: SynthOffense["variant"]): number {
  const rounded = Math.round(x * 10) / 10;
  if (variant !== "tackle_11" || onLine) return rounded;
  const MIN_OUTSIDE_OL = 6; // OL spans [-4, +4]; slots must clear by 2yd
  if (rounded > 0 && rounded < MIN_OUTSIDE_OL) return MIN_OUTSIDE_OL;
  if (rounded < 0 && rounded > -MIN_OUTSIDE_OL) return -MIN_OUTSIDE_OL;
  return rounded;
}

/* ------------------------------------------------------------------ */
/*  Variant assemblers                                                 */
/* ------------------------------------------------------------------ */

function placeTackleLine(): SynthOffensePlayer[] {
  // 5 OL on the LOS at football-realistic 2-yard splits. Tokens
  // visually overlap slightly (rendered diameter ~3.4yd > 2yd split),
  // but that's CORRECT — linemen ARE shoulder-to-shoulder, and a coach
  // reading the diagram expects to see them tight together. The
  // overlap-resolver in coachDiagramConverter explicitly skips OL-OL
  // pairs so it doesn't try to "fix" this and produce ahistorical
  // wider spreads (or oscillate, as it did before — see
  // coachDiagramConverter "Lineman pairs are exempt").
  return [
    { id: "LT", x: -4, y: 0 },
    { id: "LG", x: -2, y: 0 },
    { id: "C",  x:  0, y: 0 },
    { id: "RG", x:  2, y: 0 },
    { id: "RT", x:  4, y: 0 },
  ];
}

function placeFlagCenter(): SynthOffensePlayer[] {
  // Flag formations only have a center on the ball.
  return [{ id: "C", x: 0, y: 0 }];
}

function totalSkill(variant: SynthOffense["variant"]): number {
  switch (variant) {
    case "tackle_11": return 5;  // 11 - 5 OL - 1 QB = 5 skill
    case "flag_7v7":  return 5;  // 7 - 1 C - 1 QB = 5 skill
    case "flag_5v5":  return 3;  // 5 - 1 C - 1 QB = 3 skill
  }
}

/**
 * Down-rank a spec's receiver distribution to fit a flag variant when
 * tackle's 5 skill positions exceed the variant's allotment.
 */
function fitReceiversToVariant(
  rec: ReceiverDistribution,
  variant: SynthOffense["variant"],
  arrangement: BackArrangement,
): ReceiverDistribution {
  const skillAvailable = totalSkill(variant);
  const backsCount =
    arrangement === "none" ? 0
    : arrangement === "single" ? 1
    : arrangement === "i_stack" || arrangement === "split" ? 2
    : 3;
  const recAvailable = skillAvailable - backsCount;
  const recRequested = rec.left + rec.right + rec.te;
  if (recRequested <= recAvailable) return rec;
  // Trim: prefer dropping TE first, then weak-side receivers, then strong
  // until we fit.
  const out = { ...rec };
  let drop = recRequested - recAvailable;
  if (drop > 0 && out.te === 1) { out.te = 0; drop -= 1; }
  while (drop > 0 && out.left > 0) { out.left -= 1; drop -= 1; }
  while (drop > 0 && out.right > 0) { out.right -= 1; drop -= 1; }
  return out;
}

function synthesizeForVariant(
  spec: FormationSpec,
  variant: SynthOffense["variant"],
): SynthOffense {
  const fittedRec = fitReceiversToVariant(spec.receivers, variant, spec.backs);
  const players: SynthOffensePlayer[] = [];

  if (variant === "tackle_11") {
    players.push(...placeTackleLine());
  } else {
    players.push(...placeFlagCenter());
  }
  players.push(placeQB(spec.qb));
  players.push(...placeBacks(spec.backs));
  players.push(...placeReceivers(fittedRec, variant));

  // Round x/y to 1 decimal so the rendered diagram doesn't carry float
  // jitter that the validator's overlap check might mis-detect.
  for (const p of players) {
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;
  }

  // Mirror x for left strength.
  if (spec.strength === "left") {
    for (const p of players) {
      // Don't flip linemen / QB / centered backs (x ≈ 0 stays at 0).
      if (Math.abs(p.x) < 0.1) continue;
      p.x = -p.x;
    }
  }

  // De-dupe ids: if two players ended up with the same letter (e.g. two
  // H's on the same side), append a digit to the second.
  const seen = new Map<string, number>();
  for (const p of players) {
    const cur = seen.get(p.id);
    if (cur === undefined) {
      seen.set(p.id, 1);
    } else {
      seen.set(p.id, cur + 1);
      p.id = `${p.id}${cur + 1}`;
    }
  }

  return {
    formation: spec.derivedName,
    variant,
    description:
      `Synthesized "${spec.derivedName}" — QB ${spec.qb.replace("_", " ")}, ` +
      `${spec.backs === "none" ? "0" : spec.backs === "single" ? "1" : spec.backs === "i_stack" || spec.backs === "split" ? "2" : "3"} back(s) in the backfield, ` +
      `receivers ${fittedRec.left}x${fittedRec.right}` +
      `${fittedRec.te === 1 ? " + TE" : ""}` +
      `. Strength: ${spec.strength}. Generated from the formation name + variant rules — coaches reviewing should sanity-check splits.`,
    players,
    exactMatch: true,
  };
}

/* ------------------------------------------------------------------ */
/*  Public entry                                                       */
/* ------------------------------------------------------------------ */

/**
 * Synthesize an offensive starting alignment for a named formation.
 *
 * Returns a SynthOffense with players placed at canonical x/y for the
 * variant. If the name doesn't match any known structural pattern,
 * returns null — caller can either error out or default to Spread
 * Doubles via `synthesizeOffenseFallback`.
 */
export function synthesizeOffense(
  variant: string,
  formation: string,
): SynthOffense | null {
  const v = (variant === "tackle_11" || variant === "flag_7v7" || variant === "flag_5v5")
    ? variant
    : null;
  if (!v) return null;
  const spec = parseFormationName(formation);
  if (!spec) return null;
  return synthesizeForVariant(spec, v);
}

/**
 * Last-resort fallback: Spread Doubles (2x2). Use when the coach asks
 * for "an offensive formation" without specifying, or when synthesis
 * couldn't parse the name. Marked exactMatch=false so the result text
 * tells the coach "I drew a Spread Doubles since I couldn't pin down
 * what you meant."
 */
export function synthesizeOffenseFallback(variant: string): SynthOffense | null {
  const v = (variant === "tackle_11" || variant === "flag_7v7" || variant === "flag_5v5")
    ? variant
    : null;
  if (!v) return null;
  const spec: FormationSpec = {
    qb: "shotgun",
    backs: "single",
    receivers: { left: 2, right: 2, te: 0 },
    strength: "right",
    derivedName: "Spread Doubles (default)",
  };
  const out = synthesizeForVariant(spec, v);
  return { ...out, exactMatch: false };
}
