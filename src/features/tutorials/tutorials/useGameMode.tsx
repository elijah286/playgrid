import type { TutorialDef } from "../engine/types";

export const USE_GAME_MODE_TUTORIAL: TutorialDef = {
  id: "game_mode_v1",
  title: "Use Game Mode",
  summary:
    "Run plays from the sideline on game day — quick play picker, wristband-friendly callouts, score tracking, and a clean read for the coordinator. ~2 minutes.",
  supportedVariants: ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"],
  steps: [
    {
      id: "welcome",
      title: "Game day, one screen",
      body: () =>
        "Game Mode is the sideline tool. Pick a play, tap thumbs-up or thumbs-down after the snap to score it, queue up the next call. Other coaches can join to help score in real time.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "game-or-scrimmage",
      title: "Game or scrimmage",
      body: () =>
        "Pick one when you start a session. Scrimmages skip the scoreboard — useful for practice reps where calls and outcomes matter but the score doesn't. The session lives in the Games tab afterwards either way.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "pick-next",
      title: "Queue the next play",
      body: () =>
        "Once a play is running on the field, Choose next play opens a searchable picker. Type any part of the play name, formation, concept, or wristband code — the list narrows live.",
      anchor: { kind: "anchor", key: "game-mode-pick-next" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "score-play",
      title: "Score it with a thumb",
      body: () =>
        "After the snap, tap thumbs-up or thumbs-down on the field. A row of tags appears — pick yards / first down / score on a good play, or loss / flag / incomplete / fumble on a bad one. Scoring auto-advances to the next play.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "scoreboard",
      title: "Score and field position",
      body: () =>
        "For games (not scrimmages), the scoreboard at the bottom tracks the running score. Tap your side or theirs to add a TD, FG, safety, or extra point — the deltas show in the call log for the post-game review.",
      anchor: { kind: "anchor", key: "game-mode-score" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "review",
      title: "Review after the game",
      body: () =>
        "When you exit, the session lands in the Games tab inside the playbook. Open it to see every call, the thumb / tag for each, and aggregate stats — what worked, what didn't, by formation, concept, and down.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "done",
      title: "You're set",
      body: () =>
        "Open Game Mode from the playbook on game day, pick your first play, score with a thumb, queue the next. Everything else is automatic.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
      nextLabel: "Got it",
    },
  ],
};
