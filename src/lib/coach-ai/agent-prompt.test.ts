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

describe("NORMAL_PROMPT — Rule 8a (lobby-mode ASK-FIRST rule)", () => {
  // Surfaced 2026-05-20: a coach chatted with Cal from the home page
  // (no playbook open), Cal emitted 6 play fences, claimed all 6
  // saved, and the playbook count stayed at 0. The auto-commit only
  // runs when ctx.playbookId is set; in lobby mode every fence
  // silently evaporates. Rule 8a now FORCES Cal to ask "save or
  // describe?" before composing AND a validator gate rejects any
  // full-roster play emitted in lobby mode.

  it("names the LOBBY-MODE ASK-FIRST RULE as a hard gate", () => {
    expect(NORMAL_PROMPT).toMatch(/LOBBY-MODE ASK-FIRST RULE/);
    expect(NORMAL_PROMPT).toMatch(/HARD GATE/);
  });

  it("tells Cal to ask 'save or describe?' before composing in lobby mode", () => {
    expect(NORMAL_PROMPT).toMatch(/Save this to a playbook, or just describe the concept\?/);
  });

  it("instructs Cal to call list_my_playbooks if the coach says save", () => {
    expect(NORMAL_PROMPT).toMatch(/coach says \*\*save\*\*[\s\S]*?call `list_my_playbooks`/);
  });

  it("preserves single-route demos (rule 9a) as exempt from the lobby gate", () => {
    expect(NORMAL_PROMPT).toMatch(/Single-route demos per rule 9a[\s\S]*?are still fine/);
  });

  it("names the validator-gate enforcement so Cal knows the rule is structural", () => {
    expect(NORMAL_PROMPT).toMatch(/full-roster play fence in lobby mode is REJECTED/);
  });
});

describe("NORMAL_PROMPT — Rule 9b (hand-drawn image translation)", () => {
  // Surfaced 2026-05-20: a coach uploaded a Reddit playsheet of 8 plays
  // labeled "Noah / 67 / King / Vert Under / Money / Drive Pass / …";
  // Cal mapped the LABELS to catalog concepts whose names shared a word
  // (Drive Pass → catalog Drive, Vert Under → Four Verticals) and shipped
  // canonical geometry that bore no resemblance to what the coach had
  // drawn. The coach saw "the same play over and over" because the
  // outputs were all canonical-looking spread route trees.
  //
  // The fix is workflow-discipline in the prompt: identify each player's
  // route family from the DRAWING first, build a route map, THEN pick
  // the closest concept and use `overrides` to bend the canonical
  // skeleton toward what was drawn. These tests pin the load-bearing
  // language so a refactor can't silently drop it.

  it("declares the drawing — not the label — as the source of truth", () => {
    expect(NORMAL_PROMPT).toMatch(/THE DRAWING IS THE TRUTH/);
    expect(NORMAL_PROMPT).toMatch(/LABEL IS JUST A NICKNAME/);
  });

  it("documents the failure mode the rule is meant to prevent", () => {
    // Naming the specific bug ("kept making this play over and over")
    // is how Cal pattern-matches against its own past failures during
    // the next image upload.
    expect(NORMAL_PROMPT).toMatch(/kept making this play over and over/i);
  });

  it("walks through the 6-step image workflow in order", () => {
    const step1 = NORMAL_PROMPT.indexOf("Step 1 — Enumerate");
    const step2 = NORMAL_PROMPT.indexOf("Step 2 — For ONE play at a time");
    const step3 = NORMAL_PROMPT.indexOf("Step 3 — Build the route map");
    const step4 = NORMAL_PROMPT.indexOf("Step 4 — NOW pick the catalog concept");
    const step5 = NORMAL_PROMPT.indexOf("Step 5 — Use `overrides`");
    const step6 = NORMAL_PROMPT.indexOf("Step 6 — Confirm BEFORE composing");
    expect(step1).toBeGreaterThan(-1);
    expect(step2).toBeGreaterThan(step1);
    expect(step3).toBeGreaterThan(step2);
    expect(step4).toBeGreaterThan(step3);
    expect(step5).toBeGreaterThan(step4);
    expect(step6).toBeGreaterThan(step5);
  });

  it("gives a hand-drawn shape → route family vocabulary", () => {
    // Without the vocabulary, Cal has no grammar to translate between
    // "what's drawn on the paper" and "what compose_play needs." Each
    // entry below maps a recognizable hand-drawn shape to a catalog
    // route family.
    expect(NORMAL_PROMPT).toMatch(/Straight up arrow.*Go.*Seam/);
    expect(NORMAL_PROMPT).toMatch(/Diagonal up-and-in.*Slant.*Post.*Dig/);
    expect(NORMAL_PROMPT).toMatch(/Diagonal up-and-out.*Out.*Corner/);
    expect(NORMAL_PROMPT).toMatch(/Horizontal arrow.*Drag/);
    expect(NORMAL_PROMPT).toMatch(/Comeback/);
  });

  it("provides a worked compose_play+overrides example with real syntax", () => {
    // The example must use the actual override field names (set_family,
    // set_depth_yds) so Cal copy-pastes the right shape, not invents new
    // field names like "family" or "depth_yards" that the tool rejects.
    expect(NORMAL_PROMPT).toMatch(/compose_play\(\{ concept: "Four Verticals"/);
    expect(NORMAL_PROMPT).toMatch(/set_family: "Drag"/);
    expect(NORMAL_PROMPT).toMatch(/set_depth_yds: 2/);
  });

  it("instructs Cal to use the COACH'S name, not the catalog concept name", () => {
    // The coach's "Vert Under" must be saved as "Vert Under", not as
    // "Four Verticals". The team-specific name is how the coach will
    // find the play later.
    expect(NORMAL_PROMPT).toMatch(/save with the coach's NAME/i);
  });

  it("requires Cal to ASK when no catalog concept fits cleanly", () => {
    // Approximating with "closest-sounding" concept is the bug. The
    // prompt must explicitly tell Cal to surface uncertainty rather
    // than guess.
    expect(NORMAL_PROMPT).toMatch(/ASK; don't approximate/i);
    expect(NORMAL_PROMPT).toMatch(/closest-sounding/i);
  });

  it("preserves the one-play-at-a-time confirm rule from before", () => {
    // The rule that image imports OVERRIDE the multi-diagram batch cap
    // was already in place and must survive the rewrite.
    expect(NORMAL_PROMPT).toMatch(/One play at a time/);
    expect(NORMAL_PROMPT).toMatch(/OVERRIDES rule 9 multi-diagram/);
  });

  it("preserves the images-are-not-persisted rule", () => {
    // Cal must continue to acknowledge it can't see past-turn images
    // rather than fabricating from memory.
    expect(NORMAL_PROMPT).toMatch(/Images are NOT persisted/);
  });
});
