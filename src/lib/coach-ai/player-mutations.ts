/**
 * Identity-preserving player style/label mutations.
 *
 * Counterpart to `applyRouteMod` (route shape edits) — this handles the
 * other surgical-edit class: changing what a player LOOKS like (label,
 * color, shape) without moving them or breaking route ownership.
 *
 * Rule 9 (AGENTS.md): the helper snapshots {id, position, role} for
 * every player before applying the mod and refuses to return a doc
 * where any of those changed. A "recolor" must never become an
 * accidental re-formation.
 */

import type { PlayDocument, Player, PlayerShape } from "@/domain/play/types";

/** The named colors Cal uses when speaking. Mirrors the FormationInspector
 *  palette so coach + Cal share vocabulary. */
const FILL_COLOR_NAMES: Record<string, string> = {
  white: "#FFFFFF",
  slate: "#94A3B8",
  gray: "#94A3B8",
  grey: "#94A3B8",
  black: "#1C1C1E",
  orange: "#F26522",
  blue: "#3B82F6",
  red: "#EF4444",
  green: "#22C55E",
  yellow: "#FACC15",
  gold: "#FACC15",
  purple: "#A855F7",
  violet: "#A855F7",
};

const LABEL_COLOR_NAMES: Record<string, string> = {
  white: "#FFFFFF",
  black: "#1C1C1E",
};

/** Stroke shade paired with each fill — matches the catalog in
 *  domain/play/factory.ts so Cal-driven recolors look identical to
 *  catalog-built plays. */
const STROKE_FOR_FILL: Record<string, string> = {
  "#FFFFFF": "#0f172a",
  "#94A3B8": "#0f172a",
  "#1C1C1E": "#0f172a",
  "#F26522": "#7c2d12",
  "#3B82F6": "#1e3a8a",
  "#EF4444": "#7f1d1d",
  "#22C55E": "#166534",
  "#FACC15": "#854d0e",
  "#A855F7": "#581c87",
};

/** Sensible auto-pick for label color when the coach didn't specify one.
 *  Light fills get black text; dark fills get white. Mirrors the muscle
 *  memory of the in-app color picker. */
const AUTO_LABEL_COLOR_FOR_FILL: Record<string, string> = {
  "#FFFFFF": "#1C1C1E",
  "#94A3B8": "#1C1C1E",
  "#FACC15": "#1C1C1E",
  "#1C1C1E": "#FFFFFF",
  "#F26522": "#FFFFFF",
  "#3B82F6": "#FFFFFF",
  "#EF4444": "#FFFFFF",
  "#22C55E": "#FFFFFF",
  "#A855F7": "#FFFFFF",
};

const VALID_SHAPES: ReadonlySet<PlayerShape> = new Set<PlayerShape>([
  "circle",
  "square",
  "diamond",
  "triangle",
  "star",
]);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeColor(raw: string, palette: Record<string, string>): string | null {
  const trimmed = raw.trim();
  if (HEX_RE.test(trimmed)) return trimmed.toUpperCase().replace(/^#([0-9A-F]{6})$/, "#$1");
  const lower = trimmed.toLowerCase();
  return palette[lower] ?? null;
}

export type PlayerStyleMod = {
  /** Match by current label (e.g. "H") or by player id (UUID). */
  player_selector: string;
  /** New label, 1–3 chars. Optional. */
  label?: string;
  /** New fill color — named ("orange") or hex ("#F26522"). Optional. */
  fill?: string;
  /** New label/letter color — "white" | "black" | hex. Optional. */
  label_color?: string;
  /** Shape token — circle | square | diamond | triangle | star. Optional. */
  shape?: string;
};

export type PlayerStyleModResult =
  | { ok: true; doc: PlayDocument; player: Player; changedFields: string[] }
  | { ok: false; error: string };

/** Resolve a selector to exactly one player.
 *
 *  Three resolution paths, in order:
 *    1. UUID — exact match against `player.id`.
 *    2. Display-id (mirrors `playDocumentToCoachDiagram`'s suffix scheme):
 *       when a play has two players sharing label "Z", they're exposed to
 *       Cal as `Z` (first) and `Z2` (second). The selector accepts the
 *       same form, so Cal can disambiguate using the IDs it actually sees
 *       in `get_play` output without the coach handing over UUIDs.
 *    3. Literal label — case-sensitive. Must be unique unless step 2
 *       already resolved it.
 */
function resolvePlayer(doc: PlayDocument, selector: string): { ok: true; player: Player } | { ok: false; error: string } {
  const sel = selector.trim();
  if (!sel) return { ok: false, error: "player_selector is required." };

  const byId = doc.layers.players.find((p) => p.id === sel);
  if (byId) return { ok: true, player: byId };

  // Build the same display-id map the renderer uses, so Cal can pass `Z`
  // for the first Z and `Z2` for the second (matching what get_play shows).
  const displayIdToPlayer = new Map<string, Player>();
  const seen = new Map<string, number>();
  for (const p of doc.layers.players) {
    const base = p.label || p.id;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const displayId = count === 1 ? base : `${base}${count}`;
    displayIdToPlayer.set(displayId, p);
  }
  const byDisplay = displayIdToPlayer.get(sel);
  if (byDisplay) return { ok: true, player: byDisplay };

  const byLabel = doc.layers.players.filter((p) => p.label === sel);
  if (byLabel.length === 1) return { ok: true, player: byLabel[0]! };
  if (byLabel.length === 0) {
    const displayIds = Array.from(displayIdToPlayer.keys()).join(", ");
    return {
      ok: false,
      error: `No player with selector "${sel}". Players in this play: ${displayIds || "(none)"}.`,
    };
  }
  // Ambiguous literal label — should be unreachable because the display-id
  // map already covers the unique-first-occurrence case. Kept as a guard so
  // a future change to the display scheme doesn't silently mis-route.
  const suffixed = byLabel.map((_p, i) => (i === 0 ? sel : `${sel}${i + 1}`)).join(", ");
  return {
    ok: false,
    error: `Label "${sel}" is ambiguous — ${byLabel.length} players share it. Use the suffixed id (${suffixed}) or the player UUID.`,
  };
}

export function applyPlayerStyleMod(doc: PlayDocument, mod: PlayerStyleMod): PlayerStyleModResult {
  const resolved = resolvePlayer(doc, mod.player_selector);
  if (!resolved.ok) return resolved;
  const target = resolved.player;

  const hasAnyChange =
    typeof mod.label === "string" ||
    typeof mod.fill === "string" ||
    typeof mod.label_color === "string" ||
    typeof mod.shape === "string";
  if (!hasAnyChange) {
    return { ok: false, error: "Provide at least one of: label, fill, label_color, shape." };
  }

  let nextLabel = target.label;
  if (typeof mod.label === "string") {
    const trimmed = mod.label.trim();
    if (!trimmed) return { ok: false, error: "label cannot be empty." };
    if (trimmed.length > 3) return { ok: false, error: "label must be 1-3 characters." };
    nextLabel = trimmed;
  }

  let nextFill = target.style.fill;
  let nextStroke = target.style.stroke;
  let fillChanged = false;
  if (typeof mod.fill === "string") {
    const resolvedFill = normalizeColor(mod.fill, FILL_COLOR_NAMES);
    if (!resolvedFill) {
      const allowed = Object.keys(FILL_COLOR_NAMES).join(", ");
      return {
        ok: false,
        error: `Unknown fill color "${mod.fill}". Use a hex code like #F26522 or one of: ${allowed}.`,
      };
    }
    if (resolvedFill !== target.style.fill) {
      nextFill = resolvedFill;
      nextStroke = STROKE_FOR_FILL[resolvedFill] ?? target.style.stroke;
      fillChanged = true;
    }
  }

  let nextLabelColor = target.style.labelColor;
  if (typeof mod.label_color === "string") {
    const resolvedLabelColor = normalizeColor(mod.label_color, LABEL_COLOR_NAMES);
    if (!resolvedLabelColor) {
      return {
        ok: false,
        error: `label_color must be "white", "black", or a hex code. Got "${mod.label_color}".`,
      };
    }
    nextLabelColor = resolvedLabelColor;
  } else if (fillChanged) {
    // Coach changed the fill but didn't specify a label color — auto-pick
    // the contrast that matches the rest of the catalog. Without this, a
    // recolor to yellow leaves white-on-yellow text that's invisible.
    nextLabelColor = AUTO_LABEL_COLOR_FOR_FILL[nextFill] ?? target.style.labelColor;
  }

  let nextShape = target.shape;
  if (typeof mod.shape === "string") {
    const trimmed = mod.shape.trim().toLowerCase() as PlayerShape;
    if (!VALID_SHAPES.has(trimmed)) {
      return {
        ok: false,
        error: `shape must be one of: ${Array.from(VALID_SHAPES).join(", ")}. Got "${mod.shape}".`,
      };
    }
    nextShape = trimmed;
  }

  const changedFields: string[] = [];
  if (nextLabel !== target.label) changedFields.push("label");
  if (nextFill !== target.style.fill) changedFields.push("fill");
  if (nextLabelColor !== target.style.labelColor) changedFields.push("label_color");
  if (nextStroke !== target.style.stroke) changedFields.push("stroke");
  if (nextShape !== target.shape) changedFields.push("shape");
  if (changedFields.length === 0) {
    return { ok: false, error: "Nothing to change — every requested field already matches the player's current value." };
  }

  // Snapshot identity-preserving fields so we can verify we didn't drift.
  const idSnap = doc.layers.players.map((p) => ({
    id: p.id,
    x: p.position.x,
    y: p.position.y,
    role: p.role,
  }));

  const nextPlayer: Player = {
    ...target,
    label: nextLabel,
    shape: nextShape,
    style: { fill: nextFill, stroke: nextStroke, labelColor: nextLabelColor },
  };

  let nextNotes = doc.metadata.notes ?? "";
  if (changedFields.includes("label") && nextNotes) {
    // Mirror the reducer's @LABEL rewrite so notes-with-mentions stay in
    // sync with the renamed player.
    const escaped = target.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}(?![A-Za-z0-9])`, "g");
    nextNotes = nextNotes.replace(re, `@${nextLabel}`);
  }

  const nextDoc: PlayDocument = {
    ...doc,
    metadata: { ...doc.metadata, notes: nextNotes },
    layers: {
      ...doc.layers,
      players: doc.layers.players.map((p) => (p.id === target.id ? nextPlayer : p)),
      // Carrier route stroke follows the player's fill — same behavior as
      // the editor's player.setStyle reducer case.
      routes: fillChanged
        ? doc.layers.routes.map((r) =>
            r.carrierPlayerId === target.id
              ? { ...r, style: { ...r.style, stroke: nextFill } }
              : r,
          )
        : doc.layers.routes,
    },
  };

  // Identity guarantee — id, position, role are byte-equal across the mod.
  for (let i = 0; i < idSnap.length; i++) {
    const before = idSnap[i]!;
    const after = nextDoc.layers.players[i]!;
    if (
      before.id !== after.id ||
      before.x !== after.position.x ||
      before.y !== after.position.y ||
      before.role !== after.role
    ) {
      return {
        ok: false,
        error: "Internal error: player identity changed during style mod. This is a bug.",
      };
    }
  }

  return { ok: true, doc: nextDoc, player: nextPlayer, changedFields };
}
