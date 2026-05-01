/**
 * Spec → structured explanation projection.
 *
 * Pure function that walks a PlaySpec and produces a multi-section
 * markdown explanation suitable for `explain_play`'s tool result. No
 * LLM synthesis — every word comes from spec data + catalog lookups, so
 * the explanation cannot fabricate or contradict the saved play.
 *
 * Sections:
 *   1. Heading + play type + variant
 *   2. Formation (name, strength, confidence, structural summary)
 *   3. Defense (when set; same shape as formation)
 *   4. Per-player assignments (one bullet per assignment with depth,
 *      side, modifiers, confidence flag)
 *   5. Confidence summary (overall confidence floor, low-conf elements)
 *
 * Use cases:
 *   - `explain_play(play_id)` tool — coach asks "why does this play work?"
 *   - PR reviews of catalog changes (run on a sample play, eyeball)
 *   - Future Cal self-debugging ("does my saved spec match what I think?")
 */

import { findTemplate } from "@/domain/play/routeTemplates";
import { findDefensiveAlignment } from "@/domain/play/defensiveAlignments";
import type { AssignmentAction, Confidence, PlaySpec, PlayerAssignment } from "@/domain/play/spec";

/**
 * Build a markdown explanation of a saved PlaySpec. Output is structured
 * (headings + bullets) so it renders cleanly in chat AND can be parsed
 * back if needed.
 */
export function explainSpec(spec: PlaySpec): string {
  const sections = [
    headerSection(spec),
    formationSection(spec),
    defenseSection(spec),
    assignmentsSection(spec),
    confidenceSection(spec),
  ].filter((s) => s !== "");
  return sections.join("\n\n");
}

function headerSection(spec: PlaySpec): string {
  const title = spec.title ?? "Untitled play";
  const playType = spec.playType ?? "offense";
  return `## ${title}\n_${playType}, ${spec.variant}_`;
}

function formationSection(spec: PlaySpec): string {
  const f = spec.formation;
  const strengthClause = f.strength && f.strength !== "balanced" ? ` (${f.strength} strength)` : "";
  const confSuffix = formatConfidenceSuffix(f.confidence);
  return `**Formation**: ${f.name}${strengthClause}${confSuffix}`;
}

function defenseSection(spec: PlaySpec): string {
  if (!spec.defense) return "";
  const d = spec.defense;
  const strengthClause = d.strength ? ` (${d.strength} strength)` : "";
  const confSuffix = formatConfidenceSuffix(d.confidence);
  // If the front and coverage match a catalog entry, append a one-line
  // structural note (zone vs man, deep coverage shape) so the coach
  // sees what the spec actually maps to.
  const alignment = findDefensiveAlignment(spec.variant, d.front, d.coverage);
  const flavorNote = alignment
    ? `\n  ${formatAlignmentFlavor(alignment.manCoverage, alignment.zones?.length ?? 0)}`
    : "";
  // Canonical label: when front and coverage match (e.g. "Cover 3" / "Cover 3"), don't repeat.
  const label = d.front === d.coverage ? d.coverage : `${d.front} — ${d.coverage}`;
  return `**Defense**: ${label}${strengthClause}${confSuffix}${flavorNote}`;
}

function assignmentsSection(spec: PlaySpec): string {
  if (spec.assignments.length === 0) return "";
  const lines = spec.assignments
    .map((a) => assignmentBullet(a))
    .filter((line): line is string => line !== null);
  if (lines.length === 0) return "";
  return `**Assignments**:\n${lines.join("\n")}`;
}

function assignmentBullet(assignment: PlayerAssignment): string | null {
  const ref = `@${assignment.player}`;
  const body = describeAction(assignment.action);
  if (body === null) return null;
  const conf = formatConfidenceSuffix(assignment.confidence);
  return `- ${ref}: ${body}${conf}`;
}

function describeAction(action: AssignmentAction): string | null {
  switch (action.kind) {
    case "route": {
      const template = findTemplate(action.family);
      if (!template) {
        return `${action.family} route (off-catalog — geometry undefined)`;
      }
      const range = template.constraints.depthRangeYds;
      const depthClause =
        action.depthYds !== undefined
          ? `${action.depthYds} yards`
          : range.min === range.max
          ? `${range.min} yards`
          : `${range.min}-${range.max} yards (catalog range)`;
      const sideClause = formatSideClause(template.constraints.side);
      const modifierClause = formatModifierClause(action.modifiers);
      return `${template.name.toLowerCase()} route — ${depthClause}, ${sideClause}${modifierClause}`;
    }
    case "block": {
      if (!action.target) return "pass protect";
      if (action.target === "edge") return "pass protect — edge";
      if (action.target === "interior") return "pass protect — interior";
      if (action.target === "blitz") return "blitz pickup (read-and-pick)";
      return `block @${action.target}`;
    }
    case "carry": {
      if (action.runType) return `ballcarrier — ${formatRunType(action.runType)}`;
      return "ballcarrier";
    }
    case "motion": {
      if (typeof action.into === "string") return `pre-snap motion to @${action.into}`;
      if (action.into) return "pre-snap motion to a fixed position";
      return "pre-snap motion";
    }
    case "custom":
      return `custom shape — "${action.description}"`;
    case "unspecified":
      // Don't emit a bullet for unspecified — they add noise. Caller
      // filters nulls out.
      return null;
  }
}

function confidenceSection(spec: PlaySpec): string {
  const counts: Record<Confidence, number> = { high: 0, med: 0, low: 0 };
  const lowItems: string[] = [];

  const consider = (label: string, conf: Confidence | undefined) => {
    const c = conf ?? "high";
    counts[c] += 1;
    if (c === "low") lowItems.push(label);
  };

  consider(`formation "${spec.formation.name}"`, spec.formation.confidence);
  if (spec.defense) {
    consider(
      `defense ${spec.defense.front}/${spec.defense.coverage}`,
      spec.defense.confidence,
    );
  }
  for (const a of spec.assignments) {
    consider(`@${a.player} assignment`, a.confidence);
  }

  const floor: Confidence =
    counts.low > 0 ? "low" : counts.med > 0 ? "med" : "high";
  const floorLine = `**Confidence**: ${floor} (high: ${counts.high}, med: ${counts.med}, low: ${counts.low})`;

  if (lowItems.length === 0) return floorLine;
  // Cap the listed items so explanations don't bloat for plays with
  // many low-conf elements.
  const shown = lowItems.slice(0, 6).join(", ");
  const moreClause = lowItems.length > 6 ? `, +${lowItems.length - 6} more` : "";
  return `${floorLine}\n  Low-confidence elements: ${shown}${moreClause}`;
}

function formatConfidenceSuffix(conf: Confidence | undefined): string {
  if (!conf || conf === "high") return "";
  if (conf === "med") return " _(medium confidence)_";
  return " _(low confidence — confirm with the coach before relying on this)_";
}

function formatAlignmentFlavor(manCoverage: boolean | undefined, zoneCount: number): string {
  if (manCoverage) return "_(man coverage — defenders track receivers)_";
  if (zoneCount > 0) return `_(zone coverage — ${zoneCount} zones)_`;
  return "_(coverage mode unspecified)_";
}

function formatSideClause(side: "toward_qb" | "toward_sideline" | "vertical" | "varies"): string {
  if (side === "toward_qb") return "breaks inside (toward the QB)";
  if (side === "toward_sideline") return "breaks outside (toward the sideline)";
  if (side === "vertical") return "vertical";
  return "varies";
}

function formatModifierClause(modifiers: ReadonlyArray<string> | undefined): string {
  if (!modifiers || modifiers.length === 0) return "";
  return ` [${modifiers.join(", ")}]`;
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
    case "scramble": return "scramble";
  }
}
