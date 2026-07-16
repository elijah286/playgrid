/**
 * Derive the coverage zones for a catalog defensive starter.
 *
 * A defensive formation stores BODIES ONLY — the coverage belongs to the
 * play. But a coach starting a NEW play from "Cover 2" should get a Cover 2
 * picture, not seven bare triangles, and at creation there is no coach work
 * to overwrite. So the create path re-derives the zones from the catalog via
 * the formation's `semantic_key`.
 *
 * Only catalog starters resolve. A formation the coach drew themselves has no
 * coverage to install and returns [] — which is correct, not a fallback.
 *
 * Lives in lib/ rather than domain/ because it bridges two layers: the
 * catalog (domain) and the diagram converter (features/coach-ai). Going
 * through the converter rather than hand-mapping yards→normalized means the
 * zones land in the exact coordinate space the renderer produces, and get the
 * sanitizer pass for free (Rule 10) — the flag viewport clamps oversized
 * catalog zones.
 */

import {
  alignmentPlayersWithUniqueIds,
  zonesForStrength,
} from "@/domain/play/defensiveAlignments";
import { resolveDefenseStarter } from "@/domain/play/defenseStarters";
import type { Zone } from "@/domain/play/types";
import {
  coachDiagramToPlayDocument,
  type CoachDiagram,
} from "@/features/coach-ai/coachDiagramConverter";

export function defenseStarterZones(semanticKey: string | null | undefined): Zone[] {
  const starter = resolveDefenseStarter(semanticKey);
  if (!starter) return [];

  const { alignment, strength } = starter;
  // "balanced" alignments are authored for right and mirror onto themselves.
  const side = strength === "left" ? "left" : "right";
  const zones = zonesForStrength(alignment, side);
  if (zones.length === 0) return []; // pure-man coverages draw no zones

  // Players are included so the converter can colour each zone to match its
  // owning defender's triangle — that pairing is the whole point of the
  // ownerLabel hint.
  const players = alignmentPlayersWithUniqueIds(alignment, side);
  const diagram: CoachDiagram = {
    title: alignment.coverage,
    variant: alignment.variant,
    focus: "D",
    players: players.map((p) => ({
      id: p.uniqueId,
      role: p.role,
      x: p.x,
      y: p.y,
      team: "D",
    })),
    routes: [],
    zones: zones.map((z) => ({
      kind: z.kind,
      center: z.center,
      size: z.size,
      label: z.label,
      ownerLabel: ownerOf(z.id, players),
    })),
  };

  try {
    return coachDiagramToPlayDocument(diagram).layers.zones ?? [];
  } catch {
    // A malformed catalog entry must not block play creation — the coach
    // still gets correctly-aligned defenders, just no pre-drawn coverage.
    return [];
  }
}

/** The bare role label of the defender assigned to this zone, if any. */
function ownerOf(
  zoneId: string | undefined,
  players: ReturnType<typeof alignmentPlayersWithUniqueIds>,
): string | undefined {
  if (!zoneId) return undefined;
  const owner = players.find(
    (p) => p.assignment.kind === "zone" && p.assignment.zoneId === zoneId,
  );
  return owner?.role;
}
