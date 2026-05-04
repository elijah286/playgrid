/**
 * Save-time content validators.
 *
 * Layer 4 of the SFPA gates (after schema, route-assignment, sanitizer):
 * checks that the diagram is COHERENT as a play before it persists.
 *
 *   1. validateColorClash — no two offensive skill players may share a
 *      derived color (visually indistinguishable on the diagram).
 *   2. validateCenterEligibility — when centerIsEligible:false (7v7,
 *      tackle_11), a route from @C is illegal (snapper, not receiver).
 *   3. validateOffensiveCoverage — in flag variants, every non-QB
 *      non-LINEMAN offensive player must have an action (route or
 *      motion). Center is required only when centerIsEligible:true (5v5).
 *      Catches "Cal authored Q + C + X + Y + Z, called create_play with
 *      no routes, and saved a 5-player diagram with nothing happening"
 *      — surfaced 2026-05-04 by a coach with 5 saved Flag 5v5 plays
 *      that all rendered as static formations with zero post-snap
 *      action. Same gate catches "Cal's prose says @B does pre-snap
 *      motion + @Z carries the handoff, but the diagram only encodes
 *      C and H's routes — the prose drifted from the geometry."
 *
 * These ran historically only at chat-time inside validateDiagrams. As
 * of 2026-05-04 they also run at save-time on every create_play /
 * update_play, so a diagram that bypasses chat (Cal calling
 * create_play with the same JSON the chat-time gate rejected) cannot
 * persist either.
 */

import {
  derivedColorGroupForLabel,
  DERIVED_GROUP_HEX,
  PLAYBOOK_PALETTE,
  type CoachDiagram,
} from "@/features/coach-ai/coachDiagramConverter";
import type { PlaybookSettings } from "@/domain/playbook/settings";

const FLAG_VARIANTS = new Set(["flag_5v5", "flag_7v7"]);
const QB_LABELS = new Set(["Q", "QB"]);
const LINEMAN_LABELS = new Set(["LT", "LG", "C", "RG", "RT", "T", "G", "OL"]);

/**
 * No two offensive skill-position players may share their effective
 * token color (explicit `player.color` override wins, else the
 * role+label-derived hex). Singleton roles (QB white, C purple,
 * lineman gray) are exempt.
 */
export function validateColorClash(diagram: CoachDiagram): string[] {
  const players = Array.isArray(diagram.players) ? diagram.players : [];
  const offense = players.filter((p) => (p as { team?: string }).team !== "D");
  if (offense.length === 0) return [];

  const skillByHex = new Map<string, Array<{ id: string; group: string }>>();
  for (const p of offense as Array<{ id?: unknown; role?: unknown; color?: unknown }>) {
    if (typeof p.id !== "string") continue;
    const roleHint = typeof p.role === "string" ? p.role : undefined;
    const group = derivedColorGroupForLabel(p.id, roleHint);
    if (group === "QB" || group === "C" || group === "LINEMAN" || group === "ROTATION") continue;
    const explicitColor = typeof p.color === "string" && p.color.trim() !== "" ? p.color.trim() : null;
    const hex = explicitColor ?? DERIVED_GROUP_HEX[group];
    const list = skillByHex.get(hex) ?? [];
    list.push({ id: p.id, group });
    skillByHex.set(hex, list);
  }

  const usedHexSet = new Set(skillByHex.keys());
  const unusedNames: string[] = [];
  for (const [name, hex] of Object.entries(PLAYBOOK_PALETTE)) {
    if (name === "white" || name === "black" || name === "gray") continue;
    if (!usedHexSet.has(hex)) unusedNames.push(name);
  }

  const errors: string[] = [];
  for (const [hex, list] of skillByHex.entries()) {
    if (list.length < 2) continue;
    const ids = list.map((p) => `@${p.id}`).join(", ");
    const colorName =
      (Object.entries(PLAYBOOK_PALETTE).find(([, h]) => h === hex)?.[0]) ?? hex;
    const suggestion = unusedNames.length > 0
      ? `Pick one of ${ids.split(", ")[0]} or ${ids.split(", ")[1]} and either (a) relabel it so it derives a different color (e.g. swap a second slot @H to a distinct skill label like @Y for green, or use a back label like @B / @HB for orange), or (b) call revise_play with set_player_color: "${unusedNames[0]}" on one of them. Unused palette colors here: ${unusedNames.join(", ")}.`
      : `Override one with revise_play set_player_color, or relabel for color variety. Every standard palette color is already in use.`;
    errors.push(
      `color clash — ${ids} all render ${colorName} (${hex}). The auto-renderer derives token colors from role+label (QB white, C purple, RB/FB orange, TE green, X red, Z blue, Y green, slot yellow), and two skill-position players sharing a color is visually indistinguishable on the diagram. ${suggestion}`,
    );
  }
  return errors;
}

/**
 * Center is a snapper, not a receiver, in playbooks where
 * `centerIsEligible:false` (7v7, tackle_11 default). A route from @C
 * is illegal there.
 */
export function validateCenterEligibility(
  diagram: CoachDiagram,
  settings: PlaybookSettings | null | undefined,
  variant: string | null | undefined,
): string[] {
  if (!settings || settings.centerIsEligible !== false) return [];
  const routes = Array.isArray(diagram.routes) ? diagram.routes : [];
  if (routes.length === 0) return [];

  const players = Array.isArray(diagram.players) ? diagram.players : [];
  const centerIds = new Set(
    players
      .filter((p) => (p as { team?: string }).team !== "D")
      .filter((p) => typeof (p as { id?: unknown }).id === "string")
      .filter((p) => p.id.toUpperCase() === "C")
      .map((p) => p.id),
  );
  if (centerIds.size === 0) return [];

  const offending = routes.find(
    (r) => typeof (r as { from?: unknown }).from === "string" && centerIds.has((r as { from: string }).from),
  );
  if (!offending) return [];

  return [
    `@C has a route, but the center is not an eligible receiver in this game type (${variant ?? "unknown"}). ` +
      `The center snaps the ball and stays at the LOS — only the QB can hand off / pass to other players. ` +
      `Drop the route on @C, or move the route to one of the eligible receivers (X / Y / Z / H / S / B / F).`,
  ];
}

/**
 * In flag variants, every non-QB non-LINEMAN offensive player must
 * have an action — a route entry attached to them with a non-empty
 * `path` OR a non-empty `motion`. Center is required when
 * `centerIsEligible:true` (5v5) and exempt when false (7v7).
 *
 * This catches:
 *  - Plays where Cal authored players but forgot routes entirely (the
 *    diagram saves with `routes: []`).
 *  - Plays where Cal's prose describes "B does pre-snap motion, Z
 *    takes the handoff" but the diagram only has routes for two of
 *    the four non-QB players (the prose drifted from the geometry).
 *
 * Why flag-only: tackle_11 has linemen who legitimately block (no
 * route, no motion). Flag has no blocking and exactly 4 (5v5) or 6
 * (7v7) non-QB players who all do something on every play. A pure
 * run is still encoded as a carry (route with a forward path); not
 * an "everyone stands" diagram.
 */
export function validateOffensiveCoverage(
  diagram: CoachDiagram,
  variant: string | null | undefined,
  settings: PlaybookSettings | null | undefined,
  playType?: "offense" | "defense" | "special_teams",
): string[] {
  if (playType === "defense" || playType === "special_teams") return [];
  const variantStr = (variant ?? diagram.variant ?? "").trim();
  if (!FLAG_VARIANTS.has(variantStr)) return [];

  const players = Array.isArray(diagram.players) ? diagram.players : [];
  const offense = players
    .filter((p) => (p as { team?: string }).team !== "D")
    .filter((p) => typeof (p as { id?: unknown }).id === "string");
  if (offense.length === 0) return [];

  const centerEligible = settings?.centerIsEligible ?? (variantStr === "flag_5v5");

  const requiredIds: string[] = [];
  for (const p of offense) {
    const roleHint = typeof p.role === "string" ? p.role : undefined;
    const baseLabel = (roleHint ?? p.id).toUpperCase().replace(/\d+$/, "");
    if (QB_LABELS.has(baseLabel)) continue;
    if (LINEMAN_LABELS.has(baseLabel) && baseLabel !== "C") continue;
    if (baseLabel === "C") {
      if (!centerEligible) continue;
    }
    requiredIds.push(p.id);
  }
  if (requiredIds.length === 0) return [];

  const routes = Array.isArray(diagram.routes) ? diagram.routes : [];
  const carriersWithAction = new Set<string>();
  for (const r of routes) {
    if (typeof r !== "object" || r === null) continue;
    const from = (r as { from?: unknown }).from;
    if (typeof from !== "string") continue;
    const path = (r as { path?: unknown }).path;
    const motion = (r as { motion?: unknown }).motion;
    const hasPath = Array.isArray(path) && path.length > 0;
    const hasMotion = Array.isArray(motion) && motion.length > 0;
    if (hasPath || hasMotion) carriersWithAction.add(from);
  }

  const missing = requiredIds.filter((id) => !carriersWithAction.has(id));
  if (missing.length === 0) return [];

  const playerList = missing.map((id) => `@${id}`).join(", ");
  return [
    `Flag offensive play is missing actions for: ${playerList}. ` +
      `In ${variantStr}, every non-QB${centerEligible ? " (including @C, an eligible receiver)" : ""} offensive player must have a route or pre-snap motion. ` +
      `Common encodings: a pass route → \`{ from: "<id>", path: [[x,y], ...] }\`; pre-snap motion → \`{ from: "<id>", motion: [[x,y], ...], path: [[x,y], ...] }\` (motion is the dashed pre-snap zig-zag, path is the post-snap action — set path to [] for pure motion); a designed run / handoff target → encode the runner's gap as a forward \`path\` (no special "carry" field at the diagram level — the path IS the run). ` +
      `If the prose says "@B motions then @Z takes the handoff," the diagram MUST have a motion entry for @B AND a forward path for @Z. ` +
      `Re-emit the diagram with all ${requiredIds.length} required action(s) populated. Don't claim the play is complete in prose unless every named player has a corresponding entry.`,
  ];
}

export type PlayContentValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Aggregator used at save-time. Runs all three gates and returns a
 * single rejection if any fire. Chat-time validation calls each gate
 * individually (so it can format errors with the chat-tag prefix).
 */
export function validatePlayContent(
  diagram: CoachDiagram,
  variant: string | null | undefined,
  settings: PlaybookSettings | null | undefined,
  playType?: "offense" | "defense" | "special_teams",
): PlayContentValidation {
  const errors: string[] = [
    ...validateColorClash(diagram),
    ...validateCenterEligibility(diagram, settings, variant),
    ...validateOffensiveCoverage(diagram, variant, settings, playType),
  ];
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Format save-time content errors as a single multi-line string for
 *  Cal's tool-error feedback. */
export function formatPlayContentErrors(errors: string[]): string {
  const lines = errors.map((e) => `  • ${e}`);
  return (
    `Play content validation failed for ${errors.length} issue(s) — diagram NOT saved. ` +
    `Fix each issue and re-emit:\n` +
    lines.join("\n")
  );
}
