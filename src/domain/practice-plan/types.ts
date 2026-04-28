/**
 * Practice plan document shape stored in
 * `practice_plan_versions.document` (JSONB).
 *
 * A practice plan is a reusable template authored inside a playbook. It
 * contains an ordered list of time blocks. Each block has 1-3 lanes for
 * parallel activities (e.g. "Skill" + "Line"). Each lane optionally embeds
 * a play-editor canvas diagram (drill illustration with equipment props).
 */

import type { PlayDocument } from "../play/types";

export const PRACTICE_PLAN_SCHEMA_VERSION = 1 as const;

export type PracticePlanDocument = {
  schemaVersion: typeof PRACTICE_PLAN_SCHEMA_VERSION;
  /** Total practice duration in minutes (denormalized; derived from blocks). */
  totalDurationMinutes: number;
  /** Optional default age tier for content guidance (Cal will use this). */
  ageTier?: "tier1_5_8" | "tier2_9_11" | "tier3_12_14" | "tier4_hs" | null;
  /** Optional free-form notes shown above the timeline. */
  notes?: string;
  blocks: TimeBlock[];
};

export type TimeBlock = {
  id: string;
  /** 0-based ordering. Persisted explicitly so reorders are easy. */
  orderIndex: number;
  /** Minutes since start of practice when this block begins (e.g. 15 = 0:15). */
  startOffsetMinutes: number;
  /** Block duration in minutes. */
  durationMinutes: number;
  /** Block label, e.g. "Warm-up", "Individual", "Team install". */
  title: string;
  /** Plain-text coaching notes shown alongside the block. */
  notes: string;
  /**
   * Parallel activities running inside this block. 1 lane = single activity;
   * 2-3 lanes = parallel stations (Skill / Line / Specialists). All lanes
   * share the block's start + duration.
   */
  lanes: BlockLane[];
};

export type BlockLane = {
  id: string;
  orderIndex: number;
  /**
   * Lane label, e.g. "Skill", "Line", "Specialists". Optional for
   * single-lane blocks where the block title is enough.
   */
  title: string;
  /** Plain-text activity description / coaching points. */
  notes: string;
  /**
   * Embedded canvas diagram. The `document` is a standard PlayDocument
   * with metadata.playType === "practice_plan", which unlocks equipment
   * props in the editor.
   */
  diagram?: LaneDiagram | null;
};

export type LaneDiagram = {
  id: string;
  document: PlayDocument;
};

export const EMPTY_PRACTICE_PLAN_DOCUMENT: PracticePlanDocument = {
  schemaVersion: PRACTICE_PLAN_SCHEMA_VERSION,
  totalDurationMinutes: 0,
  ageTier: null,
  notes: "",
  blocks: [],
};

/** Recompute totalDurationMinutes from blocks. */
export function computeTotalDurationMinutes(blocks: TimeBlock[]): number {
  if (blocks.length === 0) return 0;
  let max = 0;
  for (const b of blocks) {
    const end = b.startOffsetMinutes + b.durationMinutes;
    if (end > max) max = end;
  }
  return max;
}

/** Format minutes as "0:15", "1:05", etc. */
export function formatOffset(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}
