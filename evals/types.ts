/**
 * Eval suite — Scenario + Assertion shapes.
 *
 * A Scenario is one "what does Cal do when a coach says X" test case.
 * It captures the initial context (anchored playbook, anchored play),
 * the coach's chat input (one or more turns), and a list of
 * Assertions that the runner verifies against Cal's response.
 *
 * Assertions are deliberately small + composable. The full suite of
 * shipping behaviors is the UNION of all scenarios' assertions, not
 * any single sweeping spec.
 */

import type { ChatMessage } from "@/lib/coach-ai/llm";

/* ------------------------------------------------------------------ */
/*  Scenario shape                                                    */
/* ------------------------------------------------------------------ */

/** The context the eval treats as already-set when Cal's response
 *  begins. Maps to a subset of ToolContext — only the bits scenarios
 *  actually customize. The runner fills in the rest with safe defaults
 *  (no admin, no playbook write access, etc.). */
export type ScenarioContext = {
  /** Sport variant Cal should default to. Required because most
   *  coaching prompts only make sense in a variant context. */
  sportVariant:
    | "flag_4v4"
    | "flag_5v5"
    | "flag_6v6"
    | "flag_7v7"
    | "touch_7v7"
    | "tackle_11";
  /** When set, simulates an anchored playbook the coach is editing.
   *  Plays/notes/calendar tools become available to Cal. */
  playbookId?: string;
  /** When set, simulates an anchored play (e.g. the play editor is
   *  open). Affects Cal's interpretation of "this play" deictic. */
  playId?: string;
  /** Plain-English playbook name (surfaces in the system prompt). */
  playbookName?: string;
  /** Game level (youth, hs, etc.) — affects Cal's depth caps. */
  gameLevel?: string;
  /** Sanctioning body — affects rule references in Cal's prose. */
  sanctioningBody?: string;
  /** Age division — same. */
  ageDivision?: string;
  /** When playId is set, this is the fence Cal sees as the anchored
   *  play's diagram. Used to test deictic interpretation ("this
   *  play"). */
  anchoredPlayDiagramText?: string;
  /** Phase 3 — coach preference overrides. When set, the agent
   *  injects these into the system prompt INSTEAD of fetching from
   *  Supabase. Lets eval scenarios verify preference-driven Cal
   *  behavior (label aliases, default coverages, etc.) without
   *  seeding the production DB. Shape: array of {key, value} pairs;
   *  recognized keys live in `KNOWN_PREFERENCE_KEYS` in
   *  `src/lib/coach-ai/user-preferences.ts`. */
  preferences?: Array<{ key: string; value: string }>;
  /** Cal version. Defaults to "v2" (full Phase 2 stack). Set to "v1"
   *  to test the legacy-fallback behavior (no provenance gate, no
   *  rescue, no server-side label aliasing). Matches the
   *  site_settings.coach_cal_version toggle the admin can flip. */
  calVersion?: "v1" | "v2";
};

/** One chat turn from the coach. Single-turn scenarios use [msg];
 *  multi-turn scenarios chain them in conversation order. */
export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
};

/** Captured result from running one scenario through the agent. */
export type RunCapture = {
  /** Every tool call the agent made (in order), with the tool's name
   *  and the args Cal passed. */
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  /** The final assistant text the coach would see. */
  assistantText: string;
  /** Every ```play fence in the assistant text, as parsed JSON. */
  playFences: Array<Record<string, unknown>>;
  /** Every ```spec block in the assistant text (pre-render — if Cal
   *  emitted any). Useful when asserting "Cal preferred Option A". */
  specBlocks: Array<Record<string, unknown>>;
  /** Wall-clock time the agent ran. Surfaces slow scenarios. */
  durationMs: number;
};

/* ------------------------------------------------------------------ */
/*  Assertions                                                        */
/* ------------------------------------------------------------------ */

/** An assertion takes the captured run and returns ok+message. The
 *  runner aggregates these; a scenario passes iff every assertion
 *  returns ok:true. The assertion library in `evals/assertions/` is
 *  the canonical source of helpers. */
export type Assertion = (cap: RunCapture) => AssertionResult;

export type AssertionResult =
  | { ok: true; description: string }
  | { ok: false; description: string; details: string };

/* ------------------------------------------------------------------ */
/*  Scenario                                                          */
/* ------------------------------------------------------------------ */

export type Scenario = {
  /** Lowercase-kebab name. Doubles as the CLI filter token. */
  name: string;
  /** One-line plain-English description (shows up in the run summary). */
  description: string;
  /** Origin commit / regression date / coach screenshot — anything
   *  that documents WHY this scenario exists. Helps the next person
   *  who breaks it understand the history. */
  origin: string;
  /** Whether this is a positive ("Cal should do X") or negative
   *  ("Cal must NOT do X") scenario. Affects how the runner reports
   *  failures. */
  type: "positive" | "negative";
  /** Initial context (anchored playbook, etc.). */
  context: ScenarioContext;
  /** Chat history Cal sees. Last entry MUST be role:"user" — that's
   *  the turn we're testing. Earlier entries can simulate prior
   *  conversation. */
  chat: ChatTurn[];
  /** What to check on Cal's response. All must pass for the scenario
   *  to pass. */
  assertions: Assertion[];
};

/* ------------------------------------------------------------------ */
/*  Run result                                                        */
/* ------------------------------------------------------------------ */

export type ScenarioRunResult = {
  scenario: Scenario;
  ok: boolean;
  /** Per-assertion results, in the order they were declared. */
  assertions: AssertionResult[];
  capture: RunCapture;
  /** Set when the agent crashed (vs. ran but failed assertions). */
  error?: string;
};
