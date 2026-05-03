/**
 * Programmatic open mechanism for Coach Cal. Any in-app CTA dispatches a
 * window event; the launcher subscribes to it and routes to either the
 * real chat (entitled users) or the preview chat (non-entitled users).
 *
 * Why a window event over context: the launcher is mounted up to twice
 * (global header + mobile playbook header) and we don't want to thread a
 * provider through every layout. Only the launcher with
 * acceptGlobalCommands listens, so the duplicate mount stays inert.
 */

import { track } from "@/lib/analytics/track";
import {
  ENTRY_POINTS,
  renderPromptTemplate,
  type CoachCalEntryPointId,
  type EntryPointContext,
} from "./entry-points";

export type CoachCalOpenDetail = {
  entryPoint: CoachCalEntryPointId;
  prompt: string;
  /** Monotonically increasing — lets the listener detect repeat dispatches. */
  key: number;
};

declare global {
  interface WindowEventMap {
    "coach-cal:open": CustomEvent<CoachCalOpenDetail>;
    "coach-cal:state-change": CustomEvent<{ open: boolean }>;
  }
  interface Window {
    __coachCalChatOpen?: boolean;
  }
}

let _key = 0;

export function openCoachCal(
  entryPointId: CoachCalEntryPointId,
  context: EntryPointContext = {},
): void {
  if (typeof window === "undefined") return;
  const config = ENTRY_POINTS[entryPointId];
  if (!config) return;
  const prompt = renderPromptTemplate(config.promptTemplate, context.values ?? {});
  const detail: CoachCalOpenDetail = {
    entryPoint: entryPointId,
    prompt,
    key: ++_key,
  };
  window.dispatchEvent(new CustomEvent("coach-cal:open", { detail }));
  track({
    event: "coach_cal_cta_click",
    target: entryPointId,
    metadata: { surface: "in_app_cta", entry_point: entryPointId },
  });
}
