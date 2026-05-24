/**
 * Shared types for football-kg definitions.
 *
 * Re-exports SportVariant from the play domain so KG schemas don't import
 * from sibling modules directly — the KG is self-contained and the rest of
 * the codebase imports FROM it, not the other way around.
 */

import { z } from "zod";

export type { SportVariant } from "@/domain/play/types";

/** A "side" of the field. Strength designation; some formations / concepts
 *  flip x-coords when strength is "left". */
export type Side = "left" | "right";

/** Coach-facing complexity rating. Used by the manifest CLI and (later)
 *  by the coach-context personalization layer to surface concepts at the
 *  right level for the coach's stated experience. */
export type Complexity = "basic" | "intermediate" | "advanced";

export const ComplexityZ = z.enum(["basic", "intermediate", "advanced"]);
export const SideZ = z.enum(["left", "right"]);
export const SportVariantZ = z.enum([
  "flag_5v5",
  "flag_6v6",
  "flag_7v7",
  "tackle_11",
  "other",
]);

/** Roles that can appear in an OFFENSIVE formation across all variants.
 *  This is the full union — individual formations restrict to a subset
 *  per variant (flag_5v5 canonical = {QB, C, X, Y, Z}; tackle_11 adds
 *  OL + B/F/H/S). The KG validators don't enforce variant-specific
 *  subsets here; that's left to the formation defs themselves which
 *  declare their player set. */
export type OffensiveRole =
  | "QB" | "Q"
  | "C" | "LT" | "LG" | "RG" | "RT"  // OL (tackle_11)
  | "X" | "Y" | "Z" | "H" | "S" | "F" | "B";  // skill

export const OffensiveRoleZ = z.string().regex(
  /^(QB|Q|C|LT|LG|RG|RT|X|Y|Z|H|S|F|B)\d*$/,
  "must be a known offensive role (QB, C, X, Y, Z, H, S, F, B, OL) with optional numeric suffix",
);

/** Roles that can appear in a DEFENSIVE alignment. Same disclaimer as
 *  OffensiveRole — variant-specific. Common defenders: CB / FS / SS / NB /
 *  MLB / WLB / SLB / DL labels (DE/DT/NT) / FL/FR (flat) / HL/HR (hook) /
 *  M (middle) / Sa (safety). Per-variant. */
export type DefensiveRole =
  | "CB" | "FS" | "SS" | "NB"
  | "MLB" | "WLB" | "SLB" | "M" | "W" | "Sa"
  | "DE" | "DT" | "NT"
  | "FL" | "FR" | "HL" | "HR";

export const DefensiveRoleZ = z.string().regex(
  /^(CB|FS|SS|NB|MLB|WLB|SLB|M|W|Sa|DE|DT|NT|FL|FR|HL|HR)\d*$/,
  "must be a known defensive role with optional numeric suffix",
);

/** Capability flags a concept might require — gated by playbook rules.
 *  Mirrors the `AdvancedCapabilities` from `playbookSettings` but lives
 *  here as a closed list the KG can validate against. */
export type Capability =
  | "qbRun"
  | "rpoRead"
  | "handoff"
  | "blocking"
  | "trickPlay"
  | "playAction";

export const CapabilityZ = z.enum([
  "qbRun",
  "rpoRead",
  "handoff",
  "blocking",
  "trickPlay",
  "playAction",
]);

/** Concept families. Used for routing / filtering at the manifest CLI
 *  level and for sub-agent specialization (the PracticePlanner only
 *  cares about "drill"; the PlayDesigner cares about everything else). */
export type Family =
  | "concept"
  | "formation"
  | "route"
  | "scheme"
  | "reactor-pattern"
  | "drill";

export const FamilyZ = z.enum([
  "concept",
  "formation",
  "route",
  "scheme",
  "reactor-pattern",
  "drill",
]);
