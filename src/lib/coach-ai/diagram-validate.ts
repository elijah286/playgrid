// Server-side validator for the play diagrams Cal emits as ```play fences.
// Runs after a turn that previously called place_defense — those are the
// high-stakes "matchup or full-defense" outputs where the most damaging
// errors have shown up (defenders missing, label collisions, the model
// silently moving safeties from where place_defense put them).
//
// The validator returns a list of human-readable error strings. The agent
// loop uses them to feed the model a one-shot critique and re-emit, so the
// coach never sees the broken render.

const OFFENSE_LETTERS = new Set([
  // Skill positions
  "QB", "C", "X", "Y", "Z", "H", "B", "F", "S", "TE",
  // Linemen
  "LT", "LG", "RG", "RT", "T", "G", "OL",
]);

type Player = { id: string; x: number; y: number; team?: "O" | "D" };
type Diagram = {
  variant?: string;
  players?: Player[];
  routes?: unknown[];
};

type PlaceDefenseSnapshot = {
  players: Array<{ id: string; x: number; y: number }>;
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

export function validateDiagrams(opts: {
  text: string;
  variant: string | null | undefined;
  /** Most recent place_defense return, if any. Used to catch the model
   *  silently repositioning, renaming, or dropping defenders. */
  lastPlaceDefense: PlaceDefenseSnapshot | null;
}): ValidationResult {
  const fences = extractPlayFences(opts.text);
  if (fences.length === 0) return { ok: true };

  const errors: string[] = [];
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
