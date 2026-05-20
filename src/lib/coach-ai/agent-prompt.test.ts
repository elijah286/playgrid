/**
 * Regression tests for Cal's system prompt — load-bearing rules that
 * have been deleted-by-refactor in the past and immediately produced
 * coach-visible breakage.
 *
 * Surfaced 2026-05-20: a coach pasted a Reddit question about defending
 * the Double Wing and Cal replied "this is outside my wheelhouse" /
 * "this is a coaching forum discussion topic" while telling the coach
 * to "call `search_kb` with queries like..." Two bugs stacked:
 *   (a) Rule 8z's in-scope list didn't explicitly include strategic /
 *       scouting / scheme-advising questions, so Cal refused;
 *   (b) no rule forbade exposing internal tool names to the user, so
 *       Cal told the coach to invoke search_kb (which the coach has
 *       no way to do).
 *
 * These tests guard the prompt content. They CANNOT verify Cal's
 * behavior end-to-end (that needs an LLM in the loop), but they catch
 * regressions where someone deletes a rule and Cal silently reverts.
 */

import { describe, expect, it } from "vitest";
import { NORMAL_PROMPT } from "./agent";

describe("NORMAL_PROMPT — Rule 1a (tool names are private API)", () => {
  it("forbids telling the coach to call internal tools by name", () => {
    // Cal's regression reply included a bulleted list of search_kb queries
    // the coach was supposed to run. The prompt must explicitly forbid
    // phrasings like "call search_kb with queries like..." in chat replies.
    expect(NORMAL_PROMPT).toMatch(/NEVER tell the coach to call them/i);
  });

  it("names the most-leaked tools so Cal sees them by name", () => {
    // Listing the concrete tool names that have leaked before makes the
    // rule self-applying: when Cal is about to type "call `search_kb`"
    // it can pattern-match against the prompt's own list.
    expect(NORMAL_PROMPT).toMatch(/`search_kb`/);
    expect(NORMAL_PROMPT).toMatch(/`compose_play`/);
    expect(NORMAL_PROMPT).toMatch(/`flag_outside_kb`/);
  });

  it("Rule 1a sits between Rule 1 and Rule 2 in the prompt", () => {
    const r1Idx = NORMAL_PROMPT.indexOf("1. **Ground rules-and-penalties");
    const r1aIdx = NORMAL_PROMPT.indexOf("1a. **Tool names are YOUR private API");
    const r2Idx = NORMAL_PROMPT.indexOf("2. **Read the Current context");
    expect(r1Idx).toBeGreaterThan(-1);
    expect(r1aIdx).toBeGreaterThan(r1Idx);
    expect(r2Idx).toBeGreaterThan(r1aIdx);
  });
});

describe("NORMAL_PROMPT — Rule 8z (in-scope reminder includes strategic Q&A)", () => {
  it("explicitly lists scouting / scheme advising / situational coaching as in-scope", () => {
    // Without this bullet, Cal checks the 8z list when asked about
    // defending the Double Wing, doesn't find scheme-advising on it,
    // and refuses as "outside my wheelhouse".
    expect(NORMAL_PROMPT).toMatch(/opponent scouting/i);
    expect(NORMAL_PROMPT).toMatch(/scheme advising/i);
  });

  it("names the exact regression phrasings as forbidden", () => {
    // The coach's reply contained these literal phrasings; the prompt
    // must call them out so Cal can pattern-match and avoid them.
    expect(NORMAL_PROMPT).toMatch(/coaching forum discussion topic/i);
    expect(NORMAL_PROMPT).toMatch(/seeded entries specific to/i);
  });

  it("widens the NEVER clause to cover scheme/scouting refusals", () => {
    // The old NEVER clause only protected "drills, practice content,
    // skill development, or youth coaching" — that's what let the
    // Double Wing refusal slip through. The widened clause must name
    // defensive scheme advising and opponent scouting explicitly.
    const neverClauseMatch = NORMAL_PROMPT.match(
      /NEVER tell a coach that[\s\S]{0,500}?regression/i,
    );
    expect(neverClauseMatch).not.toBeNull();
    const clause = neverClauseMatch?.[0] ?? "";
    expect(clause).toMatch(/defensive scheme advising/i);
    expect(clause).toMatch(/opponent scouting/i);
  });

  it("includes concrete examples of strategic Q&A coaches ask", () => {
    // The bullet's worth comes from giving Cal a list of question
    // shapes it should recognize as in-scope. Spot-check a few.
    expect(NORMAL_PROMPT).toMatch(/Double Wing/);
    expect(NORMAL_PROMPT).toMatch(/Cover 2/i);
  });
});

describe("NORMAL_PROMPT — Rule 7c (Plan checklist for N ≥ 3 multi-play installs)", () => {
  // Surfaced 2026-05-20: a coach's 6-play install saved 1 of 6 because
  // Cal crammed all 6 fences into one reply, hit the SSE timeout, and
  // hand-authored 5 of them. The Plan checklist + per-turn cap of 3
  // converts "do 6 plays in one mega-turn" into "propose plan, then 3
  // per turn until done."

  it("names the per-turn fence cap as 3", () => {
    // The validator's MAX_CATALOG_CONCEPT_FENCES_PER_REPLY enforces
    // this — the prompt must agree so Cal isn't surprised by rejection.
    expect(NORMAL_PROMPT).toMatch(/max 3 fences per reply|max 3 catalog-concept fences per reply|max 3 fences as a safety net/i);
  });

  it("names propose_plan as the entry point for multi-play installs", () => {
    // Phase 2 promoted the markdown checklist to a real tool. The
    // prompt rule must direct Cal to call propose_plan first, not
    // hand-write a checklist.
    expect(NORMAL_PROMPT).toMatch(/call `propose_plan` first/i);
    expect(NORMAL_PROMPT).toMatch(/update_plan_step/);
  });

  it("tells Cal the FIRST turn proposes the plan and does NOT compose", () => {
    // The bug pattern was Cal proposing the plan AND composing all 6
    // plays in the same turn. Rule must explicitly say "stop after
    // proposing the plan."
    expect(NORMAL_PROMPT).toMatch(/DO NOT call `compose_play` in the same turn you proposed the plan/i);
  });

  it("forbids copying a compose_play fence for another play", () => {
    // Cal's actual failure mode in the user's report — call compose_play
    // once, then copy/tweak the fence 5 times. Each copy fails save-time
    // validation because depths drift.
    expect(NORMAL_PROMPT).toMatch(/DO NOT copy a compose_play fence and tweak it for another play/i);
  });
});

describe("NORMAL_PROMPT — Rule 8a (lobby-mode auto-save gap)", () => {
  // Surfaced 2026-05-20: a coach chatted with Cal from the home page
  // (no playbook open), Cal emitted 6 play fences, claimed all 6
  // saved, and the playbook count stayed at 0. The auto-commit only
  // runs when ctx.playbookId is set; in lobby mode every fence
  // silently evaporates. The prompt now explicitly warns Cal about
  // this so it stops claiming "saved" in lobby mode.

  it("explicitly names the LOBBY-MODE AUTO-SAVE GAP", () => {
    expect(NORMAL_PROMPT).toMatch(/LOBBY-MODE AUTO-SAVE GAP/);
  });

  it("warns that lobby-mode play fences evaporate at end of turn", () => {
    expect(NORMAL_PROMPT).toMatch(/silently EVAPORATES/);
  });

  it("calls Cal narrating 'Saved' in lobby mode a hallucination", () => {
    expect(NORMAL_PROMPT).toMatch(/lobby mode is a hallucination/i);
  });

  it("tells Cal what to do when the harness surfaces the lobby suffix", () => {
    // The next-turn recovery instruction must include "stop composing
    // until anchored" so Cal doesn't keep emitting fences that vanish.
    expect(NORMAL_PROMPT).toMatch(/STOP composing until anchored/i);
  });
});
