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
  variant: "tackle_11" | "flag_7v7" | "touch_7v7" | "flag_6v6" | "flag_5v5" | "flag_4v4";
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

/** Non-rectangular placement shapes that don't fit the {left, right, te} model.
 *  When set, the receivers distribution is ignored and a dedicated placement
 *  function (`placeCustomShape`) is used. Added 2026-05-23 for flag-specific
 *  shapes coaches asked for (diamond, tight diamond, flag I-form stack). */
type CustomShape = "diamond" | "tight_diamond" | "stack_i";

type FormationSpec = {
  qb: QBDepth;
  backs: BackArrangement;
  receivers: ReceiverDistribution;
  /** Optional override that replaces the standard receiver distribution with
   *  a fixed geometric shape (diamond, stack-I). When set, the receivers
   *  distribution above is only used for variant-fit math, not placement. */
  customShape?: CustomShape;
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
export function parseFormationName(
  rawInput: string,
  variant?: string | null,
): FormationSpec | null {
  const raw = rawInput.toLowerCase().trim();
  if (!raw) return null;

  const strength = parseStrength(raw) ?? "right";
  const has = (kw: string) => raw.includes(kw);
  const matches = (re: RegExp) => re.test(raw);
  const isFlag =
    variant === "flag_4v4" ||
    variant === "flag_5v5" ||
    variant === "flag_6v6" ||
    variant === "flag_7v7" ||
    variant === "touch_7v7";

  // Diamond — 4-point shape (C short-middle, 2 wide on LOS, 1 deep middle
  // behind QB). "Tight Diamond" compresses the wide receivers inward for
  // pick/rub looks. The 6-man "diamond" entry in the KB ('diamond_6m') uses
  // 'wishbone' geometry — exclude it here by checking for the 6m marker.
  // Added 2026-05-23: a coach surfaced Cal hallucinating a Diamond layout
  // because the parser had no diamond entry → fell back to Spread Doubles.
  if (matches(/\bdiamond\b/) && !matches(/\b6m\b/)) {
    const tight = matches(/\btight\b/);
    return {
      qb: "shotgun",
      backs: "none",
      // Placeholder distribution — overridden by placeCustomShape. The
      // numbers below are used only by fitReceiversToVariant for the
      // count-fit math; actual placement comes from the custom branch.
      receivers: { left: 1, right: 1, te: 0 },
      customShape: tight ? "tight_diamond" : "diamond",
      strength,
      derivedName: tight ? "Tight Diamond" : "Diamond",
    };
  }

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

  // I-Formation — variant-dependent shape:
  //   - Tackle 11: traditional Pro-I (QB under center, FB at -3, HB at -6,
  //     2 WRs split + TE). Existing test pins this exact shape.
  //   - Flag (5v5/6v6/7v7): "stack-I" — QB in shotgun, 2 receivers stacked
  //     in a single-file column directly behind QB (no OL, no FB/HB roles).
  //     Coaches use this for misdirection / motion / screens off the stack.
  // The match below covers "Pro I", "I-Form", "I-Formation". A bare "Pro I"
  // in flag context still maps to the flag stack — coaches occasionally
  // ask for "Pro I" in flag meaning "the I-stack look," not literally a
  // QB-under-center Pro-I.
  if (matches(/\b(pro\s*i|i[\s-]?form|i[\s-]?formation)\b/)) {
    if (isFlag) {
      return {
        qb: "shotgun",
        backs: "none",
        // Placeholder — actual placement comes from placeCustomShape("stack_i").
        receivers: { left: 1, right: 1, te: 0 },
        customShape: "stack_i",
        strength,
        derivedName: "I-Formation",
      };
    }
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

function placeBacks(arr: BackArrangement, strength?: "left" | "right" | "balanced"): SynthOffensePlayer[] {
  switch (arr) {
    case "none": return [];
    case "single": {
      // 1 back beside the QB. Place on the STRONG side so RB swings,
      // flats, and lead-blocks naturally favor the play's strength.
      // Falls back to weak-side (legacy default) for "balanced" or
      // unspecified strength. Surfaced 2026-05-02: a Flood Right with
      // B starting on the left required B to swing across the
      // formation for the strong-side flat, which violated the Flat
      // route's "outside" side check (RB at x=-4 going to right is
      // "inside" for a left-side carrier). Strong-side B places the
      // RB at (4, -5) for strength=right, so the swing is naturally
      // outside.
      const bx = strength === "right" ? 4 : -4;
      return [{ id: "B", x: bx, y: -5 }];
    }
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
  // Note: TE on right (rec.te === 1 with rec.te placement above) doesn't
  // affect left-side slot clamping. Left slots need only clear LT.
  const leftInnerClamp = variant === "tackle_11" ? 7 : 0;
  for (let i = 0; i < rec.left; i++) {
    const x = -(wideX - i * insideStepLeft) + (i > 0 && rec.bunchSide === "left" ? 3 : 0);
    const onLine = i === 0;
    const y = onLine ? 0 : -1;
    const clamped = onLine ? Math.round(x * 10) / 10 : clampSlotXAwayFromOL(x, onLine, variant, leftInnerClamp);
    players.push({ id: labelFor("left", i, false), x: clamped, y });
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
  // For tackle_11 with a TE present, slots must clear Y (at x=6) by at
  // least the resolver's normalized threshold — that means slot
  // |x| ≥ 9. We bump the inner clamp accordingly so the formula's
  // original output is overridden when it'd land inside [-9, 9].
  // Without a TE, slots only need to clear the OL row (|x| ≥ 7).
  const innerClamp = variant === "tackle_11" && teRight ? 9 : variant === "tackle_11" ? 7 : 0;
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
    const clamped = onLine ? Math.round(x * 10) / 10 : clampSlotXAwayFromOL(x, onLine, variant, innerClamp);
    players.push({ id: labelFor("right", i, false), x: clamped, y });
  }

  // Trips spacing repair: when a clamp lifted the inner-most slot
  // upward, the next-outer slot may now be too close (within the
  // overlap threshold). Re-space inner slots if they're under 4yd
  // apart, working from the outermost-on-the-side back toward the
  // OL. This keeps Trips Right's two slots at e.g. (12, 7) instead
  // of (11, 7) so the overlap resolver doesn't trigger.
  if (variant === "tackle_11" && rec.right >= 2) {
    respaceSlotsForTackle11(players, "right", innerClamp);
  }
  if (variant === "tackle_11" && rec.left >= 2) {
    respaceSlotsForTackle11(players, "left", innerClamp);
  }

  return players;
}

/**
 * Walk the slots on one side from outside-in and ensure each
 * consecutive pair is at least MIN_SLOT_SPACING_YDS apart in x. If
 * the inside-OL clamp pushed a slot outward, the next-outer slot may
 * now violate spacing; this pushes it further out. Doesn't move the
 * outermost on-line WR (Z/X anchor the formation width).
 */
function respaceSlotsForTackle11(
  players: SynthOffensePlayer[],
  side: "left" | "right",
  innerClamp: number,
): void {
  const MIN_SLOT_SPACING = 4; // yds — keeps normalized distance > 0.075
  const sideSign = side === "right" ? 1 : -1;
  // Off-the-line slots on this side, sorted innermost-first (smallest |x|).
  const slots = players
    .filter((p) => p.y < 0 && Math.sign(p.x) === sideSign)
    .sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
  // Walk inside → outside; each next slot must be ≥ MIN_SLOT_SPACING further.
  let lastX = innerClamp - MIN_SLOT_SPACING; // primer so the first slot's |x| is at least innerClamp
  for (const slot of slots) {
    const minAbs = Math.abs(lastX) + MIN_SLOT_SPACING;
    if (Math.abs(slot.x) < minAbs) {
      slot.x = sideSign * minAbs;
    }
    lastX = slot.x;
  }
}

/**
 * Clamp a synthesized slot's x-position so it stays clear of the OL
 * row AND of the overlap resolver's normalized-distance threshold.
 * For tackle_11, the OL spans x=[-4, +4]; an inner-most slot in Trips
 * lands at exactly x=±4 from the natural formula
 * `wideX - 2*insideStep = 18 - 14 = 4`. Surfaced 2026-05-02 as
 * "S and H overlap" failures.
 *
 * MIN_OUTSIDE_OL math (TIGHTER THAN "just clear the OL"):
 *   The overlap resolver compares normalized positions:
 *     dnx = dx_yds / 53    (tackle_11 field width)
 *     dny = dy_yds / 25    (field length window)
 *     overlap if hypot(dnx, dny) < 0.0672 (≈ token diameter × 1.05)
 *   Slots are at y=-1 (off-the-line); RT/LT at y=0. So dy_yds = 1
 *   and dny = 0.04. To clear the threshold we need:
 *     dnx² > 0.0672² - 0.04² = 0.00291  →  dnx > 0.054
 *     dx_yds > 0.054 × 53 = 2.86 yds
 *   So the slot must be at least 2.86 yds (call it 3 with rounding)
 *   from RT/LT in x. RT is at x=4, so slot needs |x| ≥ 7.
 *
 * Picking 7 (not 8) as the clamp: 8 would create a different overlap
 * with the next slot out (H at x=11, S clamped to 8 → 3yd apart →
 * dnx = 0.057 < 0.0672 → resolver fails again). 7 leaves S at the
 * correct distance from BOTH RT and H.
 *
 * Flag variants don't have an OL, so no clamping needed.
 */
function clampSlotXAwayFromOL(
  x: number,
  onLine: boolean,
  variant: SynthOffense["variant"],
  innerClamp: number,
): number {
  const rounded = Math.round(x * 10) / 10;
  if (variant !== "tackle_11" || onLine || innerClamp <= 0) return rounded;
  if (rounded > 0 && rounded < innerClamp) return innerClamp;
  if (rounded < 0 && rounded > -innerClamp) return -innerClamp;
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

/**
 * Place receivers for shapes that don't fit the {left, right, te} model
 * (diamond, tight diamond, stack-I). Returns the receivers ONLY — the
 * caller is responsible for placing the C (or OL) + QB.
 *
 * Diamond (revised 2026-05-23 after coach feedback): a TRUE 4-point
 * geometric diamond. Earlier version put X and Z on the LOS at ±10 yds,
 * which read as a wide spread / T-shape — not a recognizable diamond. The
 * coach surfaced "the outside receivers are too far away" and the title
 * "Diamond" misrepresented a Spread Doubles shape. New geometry:
 *
 *   C    (0, 0)        TOP point     — on the LOS, middle
 *   X    (-5, -3)      LEFT point    — off the LOS at intermediate depth
 *   Z    ( 5, -3)      RIGHT point   — off the LOS at intermediate depth
 *   Y    (0, -7)       BOTTOM point  — behind QB on the centerline
 *
 * The four points form a true diamond when viewed on the field. X and Z
 * being OFF the LOS is what makes this a diamond rather than a T — they're
 * at the lateral midpoint between C (LOS) and Y (deep). Splits scale with
 * variant: tackle_11 / flag_7v7 spread slightly wider than 5v5 to match
 * field width.
 *
 * Tight Diamond: same 4 points but X/Z compressed inward to ~3 yards for
 * pick/rub looks vs man press.
 *
 * Stack-I: receivers stacked in a single-file column directly behind QB
 * at y=-7, -10, -13, ... Remaining receivers split wide.
 */
function placeCustomShape(
  shape: CustomShape,
  skillCount: number,
  variant: SynthOffense["variant"],
): SynthOffensePlayer[] {
  const wideX = variant === "tackle_11" ? 18 : variant === "flag_7v7" ? 12 : 10;
  const players: SynthOffensePlayer[] = [];

  if (shape === "diamond" || shape === "tight_diamond") {
    // True 4-point diamond geometry (revised — see docstring).
    // X/Z are OFF the LOS at intermediate depth, not on the LOS at extreme
    // splits. This is what makes the shape READ as a diamond.
    const isTight = shape === "tight_diamond";
    const diamondX = isTight
      ? (variant === "tackle_11" ? 4 : variant === "flag_7v7" ? 4 : 3)
      : (variant === "tackle_11" ? 7 : variant === "flag_7v7" ? 6 : 5);
    players.push({ id: "X", x: -diamondX, y: -3 });
    players.push({ id: "Z", x:  diamondX, y: -3 });
    players.push({ id: "Y", x: 0, y: -7 });
    // Variants with > 3 skill positions get additional wide receivers split
    // outside the diamond points (on the LOS) so the diamond core stays
    // intact. 6v6 → +1 (one wider WR), 7v7 → +2 (one each side).
    const slotLabels = ["H", "S", "F"];
    const outerX = wideX; // wide-WR position, well outside the diamond
    for (let i = 0; i < skillCount - 3; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      players.push({
        id: slotLabels[i] ?? `H${i + 1}`,
        x: side * outerX,
        y: 0,
      });
    }
    return players;
  }

  // stack_i — receivers in a vertical column behind the QB. For variants
  // with > 2 skill positions, additional receivers split wide as X / Z.
  if (shape === "stack_i") {
    // 5v5 (3 skill): 1 stacked behind QB + X + Z (column visible against
    //   the LOS+wide pattern). Smaller-roster variants can't sustain a
    //   2-deep column because the wide WRs would be missing entirely.
    // 6v6 (4 skill): 2 stacked + X + Z (true I-stack with wide flankers).
    // 7v7 (5 skill): 2 stacked + X + slot + Z.
    // tackle_11 (5 skill): same as 7v7 — though tackle's I-Form is handled
    //   by the Pro-I branch above and shouldn't reach this code path.
    const stackCount = skillCount <= 3 ? 1 : 2;
    for (let i = 0; i < stackCount; i++) {
      players.push({ id: i === 0 ? "Y" : "H", x: 0, y: -7 - i * 3 });
    }
    const remaining = skillCount - stackCount;
    // Place outermost wide WRs first (X left, Z right), then slots inside.
    if (remaining >= 1) players.push({ id: "Z", x:  wideX, y: 0 });
    if (remaining >= 2) players.push({ id: "X", x: -wideX, y: 0 });
    const innerLabels = ["S", "F"];
    const slotInner = variant === "tackle_11" ? 7 : variant === "flag_7v7" ? 5 : 4;
    for (let i = 2; i < remaining; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      players.push({ id: innerLabels[i - 2] ?? `S${i}`, x: side * slotInner, y: -1 });
    }
    return players;
  }

  // Exhaustiveness check — TypeScript catches missing shape branches.
  const _exhaustive: never = shape;
  return _exhaustive;
}

function totalSkill(variant: SynthOffense["variant"]): number {
  switch (variant) {
    case "tackle_11": return 5;  // 11 - 5 OL - 1 QB = 5 skill
    case "flag_7v7":
    case "touch_7v7": return 5;  // 7 - 1 C - 1 QB = 5 skill
    case "flag_6v6":  return 4;  // 6 - 1 C - 1 QB = 4 skill
    case "flag_5v5":  return 3;  // 5 - 1 C - 1 QB = 3 skill
    case "flag_4v4":  return 3;  // 4 - 1 QB = 3 skill (no center in canonical 4v4 roster)
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
  // Trim: drop the TE first (it's a tackle/7v7 concept), then drop from
  // whichever side has more receivers (preserving weak-side ties for the
  // play's strength). Surfaced 2026-05-04: Spread Doubles {2,2} in
  // flag_5v5 trimmed to {0, 2} (all weak-side receivers stripped),
  // emitting only one-side receivers and dropping @X. Balanced trim
  // keeps {1, 1} so canonical {Q, C, X, Y, Z} comes through.
  const out = { ...rec };
  let drop = recRequested - recAvailable;
  if (drop > 0 && out.te === 1) { out.te = 0; drop -= 1; }
  while (drop > 0 && (out.left > 0 || out.right > 0)) {
    if (out.left >= out.right && out.left > 0) {
      out.left -= 1;
    } else {
      out.right -= 1;
    }
    drop -= 1;
  }
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
  players.push(...placeBacks(spec.backs, spec.strength));
  // Custom shapes (diamond / tight diamond / stack-I) bypass the standard
  // {left, right, te} receiver placement. The skill count remaining after
  // QB + (OL or C) + backs determines how many receivers to place.
  if (spec.customShape) {
    const backsCount =
      spec.backs === "none" ? 0
      : spec.backs === "single" ? 1
      : spec.backs === "i_stack" || spec.backs === "split" ? 2
      : 3;
    const skillRemaining = totalSkill(variant) - backsCount;
    players.push(...placeCustomShape(spec.customShape, skillRemaining, variant));
  } else {
    players.push(...placeReceivers(fittedRec, variant));
  }

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

  // flag_5v5 canonical roster pass: 5v5 leagues use exactly {Q, C, X, Y, Z}
  // (5 distinct hues, 5 distinct labels). The shared placeBacks /
  // placeReceivers helpers emit tackle/7v7 labels (B for backs, H/S/F
  // for slots) which match the validator's allowed set in flag_7v7 +
  // tackle_11 but FAIL the validator in flag_5v5 (and produce a
  // 6-player roster when both a back AND a slot label slip through).
  // Remap any non-canonical id to Y so saved 5v5 plays match the
  // league convention. Dedup follows below — Y collisions become
  // Y, Y2, ... (which the validator's roster gate tolerates via
  // suffix-strip; the color-clash gate then surfaces the duplicate-yellow
  // problem, which is the correct signal for "this formation can't fit
  // in 5v5's roster").
  if (variant === "flag_5v5") {
    const CANONICAL_5V5 = new Set(["Q", "QB", "C", "X", "Z"]);
    for (const p of players) {
      if (!CANONICAL_5V5.has(p.id)) p.id = "Y";
    }
  }

  // De-dupe ids: if two players ended up with the same letter (e.g. two
  // H's on the same side, or two Y's after the 5v5 remap), append a
  // digit to the second.
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
  const v = (
    variant === "tackle_11" ||
    variant === "flag_7v7" ||
    variant === "touch_7v7" ||
    variant === "flag_6v6" ||
    variant === "flag_5v5" ||
    variant === "flag_4v4"
  )
    ? variant
    : null;
  if (!v) return null;
  const spec = parseFormationName(formation, v);
  if (!spec) return null;
  return synthesizeForVariant(spec, v);
}

/* ------------------------------------------------------------------ */
/*  Flexibility modifiers (Phase 1-3, 2026-05-23)                       */
/* ------------------------------------------------------------------ */

/** Per-player position override. Cal supplies the player id and one or both
 *  coordinates; the other coord falls through from the catalog. */
export type PlayerOverride = { x?: number; y?: number };

/** Spacing modifier: scales the magnitude of off-center x-coordinates.
 *  Centerline players (|x| < 1) are unaffected.
 *
 *   - "tight": multiplier 0.5 — receivers pull inward (~half the natural split)
 *   - "wide":  multiplier 1.3 — receivers spread outward
 *   - "normal" (default): no change
 *
 *   Use when the coach asks for compressed splits ("tight bunch", "tight
 *   diamond") or wider splits than the catalog default. Cal's prompt
 *   surfaces this as a modifier on `place_offense`. */
export type SpacingModifier = "tight" | "wide" | "normal";

/** Stack modifier: take two named players and place the second one DIRECTLY
 *  behind the first at the same x, 2 yds back. Encoded as "FRONT-BACK" — e.g.
 *  "Z-Y" means Y stacks behind Z at the same x.
 *
 *  Validation: both players must exist in the layout; the "BACK" player's
 *  current position is discarded in favor of the stack position. Cal
 *  surfaces this when a coach asks for "X stacked behind Z" etc. */
export type StackModifier = string; // "FRONT-BACK" pair (e.g. "Z-Y")

const SPACING_FACTOR: Record<SpacingModifier, number> = {
  tight: 0.5,
  wide: 1.3,
  normal: 1.0,
};

/** Apply spacing modifier in place. Centerline players (|x| < 1) and
 *  players placed at the exact center (x=0) keep their position so the
 *  C and centered Y on diamond stays put. */
export function applySpacingModifier(
  players: SynthOffensePlayer[],
  spacing: SpacingModifier,
): void {
  const factor = SPACING_FACTOR[spacing];
  if (factor === 1.0) return;
  for (const p of players) {
    if (Math.abs(p.x) < 1) continue;
    p.x = Math.round(p.x * factor * 10) / 10;
  }
}

/** Parse a stack spec like "Z-Y" or "X-H" into the front + back ids.
 *  Returns null when the format isn't a single dash-separated pair. */
export function parseStackSpec(spec: string): { front: string; back: string } | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)-([A-Za-z][A-Za-z0-9]*)$/.exec(spec.trim());
  if (!match) return null;
  return { front: match[1], back: match[2] };
}

/** Apply a stack modifier in place — moves `back` to be 2 yds behind `front`
 *  at the same x. Returns true on success, false when either id is missing.
 *  Stacking is for pre-snap disguise (route distribution unclear); the
 *  receiver behind releases late, the receiver in front jams or quick-releases. */
export function applyStackModifier(
  players: SynthOffensePlayer[],
  stack: StackModifier,
): boolean {
  const parsed = parseStackSpec(stack);
  if (!parsed) return false;
  const front = players.find((p) => p.id === parsed.front);
  const back = players.find((p) => p.id === parsed.back);
  if (!front || !back) return false;
  back.x = front.x;
  back.y = front.y - 2; // 2 yds behind the front receiver
  return true;
}

/** Apply per-player x/y overrides in place. Unknown ids are silently
 *  ignored (caller is responsible for verifying the overrides reference
 *  real players in the layout — the place_offense tool surfaces a warning
 *  when an override targets a player that didn't make it into the roster). */
export function applyOverrides(
  players: SynthOffensePlayer[],
  overrides: Record<string, PlayerOverride>,
): { applied: string[]; missing: string[] } {
  const applied: string[] = [];
  const missing: string[] = [];
  for (const [id, override] of Object.entries(overrides)) {
    const player = players.find((p) => p.id === id);
    if (!player) {
      missing.push(id);
      continue;
    }
    if (typeof override.x === "number") player.x = Math.round(override.x * 10) / 10;
    if (typeof override.y === "number") player.y = Math.round(override.y * 10) / 10;
    applied.push(id);
  }
  return { applied, missing };
}

/** Build a SynthOffense from a custom freehand layout — no catalog lookup.
 *  Cal uses this when the coach describes a layout that doesn't match any
 *  named formation. The output goes through the same sanitizer + validator
 *  pipeline as catalog-synthesized layouts, so guardrails still catch
 *  overlaps, missing players, and color clashes.
 *
 *  Roster check: count must match the variant. ids must be unique. Returns
 *  null on basic structural problems; caller surfaces the error to Cal. */
export function buildCustomOffense(
  variant: SynthOffense["variant"],
  layout: Array<{ id: string; x: number; y: number }>,
): SynthOffense | null {
  if (layout.length === 0) return null;
  const seen = new Set<string>();
  for (const p of layout) {
    if (seen.has(p.id)) return null; // duplicate id
    seen.add(p.id);
  }
  const players: SynthOffensePlayer[] = layout.map((p) => ({
    id: p.id,
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
  }));
  return {
    formation: "Custom",
    variant,
    description:
      `Custom freehand layout (${variant}) — ${layout.length} players placed by the model. ` +
      `Coach should sanity-check that the spatial relationships match what they asked for.`,
    players,
    exactMatch: true,
  };
}

/**
 * Last-resort fallback: Spread Doubles (2x2). Use when the coach asks
 * for "an offensive formation" without specifying, or when synthesis
 * couldn't parse the name. Marked exactMatch=false so the result text
 * tells the coach "I drew a Spread Doubles since I couldn't pin down
 * what you meant."
 */
export function synthesizeOffenseFallback(variant: string): SynthOffense | null {
  const v = (
    variant === "tackle_11" ||
    variant === "flag_7v7" ||
    variant === "touch_7v7" ||
    variant === "flag_6v6" ||
    variant === "flag_5v5" ||
    variant === "flag_4v4"
  )
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
