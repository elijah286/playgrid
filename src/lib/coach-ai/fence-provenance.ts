/**
 * Phase 2b — Fence provenance tracking.
 *
 * The structural gate that completes the spec-only authoring loop:
 * every `\`\`\`play` fence that reaches the coach MUST have come from
 * either (a) a tool call that emitted a fence, or (b) a `\`\`\`spec`
 * block rendered server-side. Any other fence is hand-authored by Cal
 * — exactly the failure mode we're closing.
 *
 * "Approved" tracking is a per-turn `Set<string>` of canonicalized
 * fingerprints. A fingerprint normalizes a fence body to its
 * structural content (parsed JSON, sorted keys, no whitespace) so
 * cosmetic differences (Cal adds a newline, reorders keys) don't
 * trigger rejection. Real changes — different player coords, added
 * route, etc. — produce different fingerprints.
 *
 * On rejection, the chat-time validator returns a critique that
 * instructs Cal to emit a `\`\`\`spec` block instead. Cal's retry
 * uses the spec path; if Cal re-emits the hand-authored fence, the
 * second retry fails the same gate and the harness ships a graceful
 * "couldn't compose" message (existing stripBrokenFences path).
 */

/* ------------------------------------------------------------------ */
/*  Fingerprint                                                        */
/* ------------------------------------------------------------------ */

/** Canonicalize a fence body to its structural identity. Parses as
 *  JSON + stringifies with deterministic key ordering. Whitespace
 *  changes, key reordering, and trailing-comma quirks DON'T affect
 *  the fingerprint; actual content changes DO.
 *
 *  Returns null when the body isn't valid JSON (in which case the
 *  caller treats the fence as un-fingerprintable — a separate gate
 *  will reject it as malformed). */
export function fingerprintFence(body: string): string | null {
  if (!body || !body.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  return canonicalStringify(parsed);
}

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k]))
        .join(",") +
      "}"
    );
  }
  return "null";
}

/* ------------------------------------------------------------------ */
/*  Approved-fence tracking                                            */
/* ------------------------------------------------------------------ */

/** Mutable per-turn tracker. The chat pipeline creates one of these
 *  at the start of each turn, adds fence fingerprints as tools run +
 *  as spec blocks are rendered, then passes it to the validator. */
export class ApprovedFenceTracker {
  private readonly fingerprints = new Set<string>();

  /** Record an approved fence (by body). Tool fences and spec-rendered
   *  fences both flow through here. No-op when the body isn't valid
   *  JSON — the caller's normal validation catches that separately. */
  approve(body: string): void {
    const fp = fingerprintFence(body);
    if (fp) this.fingerprints.add(fp);
  }

  /** Does the given fence body match any approved fingerprint? */
  contains(body: string): boolean {
    const fp = fingerprintFence(body);
    if (!fp) return false;
    return this.fingerprints.has(fp);
  }

  /** Number of approved fences tracked. */
  get size(): number {
    return this.fingerprints.size;
  }

  /** Snapshot the approved fingerprints (for tests / debugging). */
  snapshot(): string[] {
    return [...this.fingerprints];
  }
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** Result of validating fence provenance for one assistant reply. */
export type FenceProvenanceResult =
  | { ok: true }
  | {
      ok: false;
      /** The hand-authored fence bodies (first 200 chars of each, for
       *  surfacing in the critique). */
      handAuthoredFences: string[];
    };

/** Extract every `\`\`\`play` fence body from `text` and check each
 *  against `approved`. Returns ok:true when every fence is approved
 *  OR there are no fences. Returns ok:false with the hand-authored
 *  bodies otherwise.
 *
 *  This is the load-bearing gate of Phase 2b. The chat-time validator
 *  uses it to reject hand-authored fences with a clear retry critique
 *  that points Cal at `\`\`\`spec` emission. */
export function validateFenceProvenance(
  text: string,
  approved: ApprovedFenceTracker,
): FenceProvenanceResult {
  if (!text) return { ok: true };
  const FENCE_RE = /```play\s*\n([\s\S]*?)\n```/g;
  const handAuthored: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(text)) !== null) {
    const body = m[1].trim();
    if (!approved.contains(body)) {
      handAuthored.push(body.slice(0, 200));
    }
  }
  if (handAuthored.length === 0) return { ok: true };
  return { ok: false, handAuthoredFences: handAuthored };
}

/** Shared fill-in-the-blank ```spec template + Path A/B guidance.
 *  Used by both `fenceProvenanceCritique` (when the gate catches a
 *  hand-authored fence) AND the diagram-validator's critique in
 *  `agent.ts` (when a hand-authored fence fails structural checks
 *  like "title says spread but 3 backs in backfield"). Both paths
 *  benefit from showing Cal the exact spec syntax to copy-paste.
 *
 *  Single source of truth: a change to the template propagates to
 *  every entry point that pushes Cal toward spec emission. */
export function specEmissionGuidance(opts?: {
  variant?: "flag_5v5" | "flag_6v6" | "flag_7v7" | "tackle_11";
}): string {
  const FENCE_MARKER = "```";
  const variantStr = opts?.variant ?? "<variant>";

  const specTemplate =
    "\n\n" + FENCE_MARKER + "spec\n" +
    "{\n" +
    '  "schemaVersion": 1,\n' +
    `  "variant": "${variantStr}",\n` +
    '  "title": "<short play title>",\n' +
    '  "playType": "offense",\n' +
    '  "formation": { "name": "<formation>", "strength": "right" },\n' +
    '  "assignments": [\n' +
    '    { "player": "X", "action": { "kind": "route", "family": "Hitch" } }\n' +
    "  ]\n" +
    "}\n" +
    FENCE_MARKER;

  return (
    "Two paths to a clean fence — pick the one that matches your play:" +
    "\n\n**Path A — CATALOG CONCEPT** (Mesh, Smash, Snag, Curl-Flat, Four Verticals, Drive, Y-Cross, etc.):" +
    '\n  1. Call `compose_play({ concept: "<name>", ... })`.' +
    "\n  2. The tool returns both a " + FENCE_MARKER + "spec block AND a " + FENCE_MARKER + "play fence. Drop the SPEC block (Option A) into your reply verbatim. STOP." +
    "\n\n**Path B — FORMATION + ROUTES** (Spread Doubles with hitches all around, Trips with an option route on @X, any bespoke combo not in the catalog):" +
    "\n  1. Call `place_offense({ formation: \"<name>\" })` if you haven't already (gets you the player positions)." +
    "\n  2. Emit this spec block (replace `<formation>`, `<short play title>`, and the `assignments[]` entries):" +
    specTemplate +
    "\n\nCatalog route families: Slant, Post, Curl, Hitch, Go, Out, In, Dig, Drag, Flat, Sit, Seam, Corner, Wheel, Comeback." +
    "\nBespoke / off-catalog routes (option routes, screens, exotic combos): use `{ \"kind\": \"custom\", \"description\": \"...\", \"waypoints\": [[x,y],...] }` instead of `{ \"kind\": \"route\", \"family\": \"...\" }`." +
    "\nOne assignment per non-QB player. In flag_5v5 the center @C is eligible — give them a route too." +
    "\n\nRe-emit with a " + FENCE_MARKER + "spec block, NOT a " + FENCE_MARKER + "play fence."
  );
}

/** Build the critique text the chat-time validator sends to Cal when
 *  hand-authored fences are detected. Phrased to push Cal toward the
 *  spec-emission path (the structural fix), not to try to repair the
 *  fence by hand.
 *
 *  `opts.variant` is used to prefill the inline spec template's
 *  `"variant"` field. Without it, Cal sees `"<variant>"` and must
 *  fill it in — usually fine, but a one-character LLM mistake there
 *  produces a render error.
 *
 *  `opts.handAuthoredFences` is optional context (the first 200 chars
 *  of each rejected fence body). Currently unused for prefill, but
 *  reserved for future extraction of formation/title hints. */
export function fenceProvenanceCritique(
  handAuthoredCount: number,
  opts?: {
    variant?: "flag_5v5" | "flag_6v6" | "flag_7v7" | "tackle_11";
    handAuthoredFences?: string[];
  },
): string {
  const FENCE_MARKER = "```"; // avoids template-literal collision below
  const leadIn =
    handAuthoredCount === 1
      ? "You emitted a " + FENCE_MARKER + "play fence"
      : "You emitted " + handAuthoredCount + " " + FENCE_MARKER + "play fences";

  return (
    leadIn +
    ' by hand. Hand-authored fences are forbidden — they\'re the root cause of every "wrong coordinates" bug we\'ve patched (Diamond Crossers regression, Four Verticals in flag_5v5, Bunch-in-5v5-collapses-to-Doubles, prose-route mismatches).' +
    "\n\n" +
    specEmissionGuidance({ variant: opts?.variant })
  );
}
