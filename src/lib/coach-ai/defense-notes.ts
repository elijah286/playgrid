/**
 * Deterministic coaching-notes projection for a defensive play.
 *
 * Offense plays created through compose_play already ship with notes projected
 * from their spec (play-tools.ts — "a play is never noteless"). Defense plays
 * saved from a compose_defense fence go through a SEPARATE server action
 * (createDefensePlayFromFenceAction) that bypassed that guarantee, so they were
 * born with blank notes (surfaced 2026-07-04). This projector closes that gap:
 * it reuses the hand-authored COVERAGE_PROFILES (summary + soft spots) plus the
 * diagram's own zones/defenders to describe the coverage — so a saved defense
 * is teach-ready by default, consistent with the offense path.
 */
import { findCoverageProfile } from "@/domain/play/coverageProfiles";

type NotesPlayer = { id?: string; label?: string; role?: string; team?: string; x?: number; y?: number };
type NotesZone = { label?: string; center?: [number, number]; ownerLabel?: string };
type NotesDiagram = { players?: NotesPlayer[]; zones?: NotesZone[] };

// Zone labels / depths that indicate a DEEP responsibility vs an underneath one.
const DEEP_RE = /deep|half|third|quarter|1\s*\/\s*[234]|post|middle third/i;
const DEEP_Y = 12; // yards downfield at/above which a zone counts as deep

function labelOf(p: NotesPlayer): string {
  return (p.label?.trim() || p.id?.trim() || p.role?.trim()) ?? "?";
}

/** Which defender owns a zone: the catalog's ownerLabel when present, else the
 *  nearest defender to the zone center. */
function ownerFor(zone: NotesZone, defenders: NotesPlayer[]): string | null {
  if (zone.ownerLabel?.trim()) return zone.ownerLabel.trim();
  if (!zone.center) return null;
  let best: { d: number; label: string } | null = null;
  for (const p of defenders) {
    if (typeof p.x !== "number" || typeof p.y !== "number") continue;
    const dx = p.x - zone.center[0];
    const dy = p.y - zone.center[1];
    const d = dx * dx + dy * dy;
    if (!best || d < best.d) best = { d, label: labelOf(p) };
  }
  return best?.label ?? null;
}

/**
 * Build plain-text coaching notes for a defensive play. Always returns a
 * non-empty string when there is at least a play name — so the create path can
 * unconditionally use it and never leave a play noteless.
 */
export function buildDefenseNotes(opts: {
  /** The saved play name, e.g. "Cover 2 vs Pull Right" — used to detect the coverage. */
  playName: string;
  /** The defense-only diagram (defenders + zones). */
  diagram: NotesDiagram;
  /** The offense this defense is set against, if known. */
  offenseName?: string | null;
}): string {
  const { playName, diagram, offenseName } = opts;
  const profile = findCoverageProfile(playName);
  const defenders = (diagram.players ?? []).filter((p) => p.team === "D");
  const zones = (diagram.zones ?? []).filter((z) => z.label || z.center);
  const vs = offenseName ? ` vs ${offenseName}` : "";
  const lines: string[] = [];

  // What the coverage does (hand-authored summary when the coverage is known).
  if (profile) {
    lines.push(`**${profile.coverage}${vs}** — ${profile.summary}`);
  } else {
    lines.push(`**${playName}** — defensive coverage${offenseName ? ` set against ${offenseName}` : ""}.`);
  }

  // Assignments, split deep vs underneath (from the diagram's zones/defenders).
  if (zones.length > 0) {
    const deep: string[] = [];
    const under: string[] = [];
    for (const z of zones) {
      const owner = ownerFor(z, defenders);
      const lbl = z.label?.trim() || "zone";
      const entry = owner ? `${owner} (${lbl})` : lbl;
      const isDeep = (z.label ? DEEP_RE.test(z.label) : false) || (z.center ? z.center[1] >= DEEP_Y : false);
      (isDeep ? deep : under).push(entry);
    }
    lines.push("");
    lines.push("**Assignments:**");
    if (deep.length) lines.push(`- Deep: ${deep.join(", ")} — take away anything over the top.`);
    if (under.length) lines.push(`- Underneath: ${under.join(", ")} — read the QB and break on the throw.`);
  } else if (defenders.length > 0) {
    lines.push("");
    lines.push(`**Defenders:** ${defenders.map(labelOf).join(", ")} — match your assignments and stay disciplined.`);
  }

  // Where the offense attacks this coverage — the coaching "watch for".
  if (profile && profile.softSpots.length > 0) {
    lines.push("");
    lines.push(`**Watch for${offenseName ? ` (how ${offenseName} can attack this)` : ""}:**`);
    for (const s of profile.softSpots) lines.push(`- ${s}`);
  }

  return lines.join("\n").trim();
}
