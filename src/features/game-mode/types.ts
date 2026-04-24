import type { PlaybookDetailPlayRow } from "@/app/actions/plays";

export type GameModePlay = PlaybookDetailPlayRow;

export type ThumbDirection = "up" | "down";

export type ThumbsUpTag = "yards" | "first_down" | "score";
export type ThumbsDownTag = "loss" | "flag" | "incomplete" | "fumble";

export type PlayOutcome =
  | { thumb: "up"; tag: ThumbsUpTag | null }
  | { thumb: "down"; tag: ThumbsDownTag | null }
  | null;

export type CalledPlayLogEntry = {
  playId: string;
  playName: string;
  outcome: PlayOutcome;
  /** ISO timestamp the play was first shown in game mode. */
  calledAt: string;
};

export type GameSessionResult = {
  startedAt: string;
  endedAt: string;
  opponent: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
  notes: string | null;
  calls: CalledPlayLogEntry[];
};

export const THUMBS_UP_TAGS: { value: ThumbsUpTag; label: string }[] = [
  { value: "yards", label: "Gain of yardage" },
  { value: "first_down", label: "First down" },
  { value: "score", label: "Score" },
];

export const THUMBS_DOWN_TAGS: { value: ThumbsDownTag; label: string }[] = [
  { value: "loss", label: "Loss of yards" },
  { value: "flag", label: "Flag" },
  { value: "incomplete", label: "Incomplete" },
  { value: "fumble", label: "Fumble" },
];
