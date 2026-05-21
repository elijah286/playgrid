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

  it("walks through the 8-step image workflow in order", () => {
    const step1 = NORMAL_PROMPT.indexOf("Step 1 — Enumerate what's LITERALLY on the page");
    const step2 = NORMAL_PROMPT.indexOf("Step 2 — For ONE play at a time");
    const step3 = NORMAL_PROMPT.indexOf("Step 3 — Build the route map");
    const step4 = NORMAL_PROMPT.indexOf("Step 4 — WAIT. CONFIRM THE ROUTE READS");
    const step5 = NORMAL_PROMPT.indexOf("Step 5 — On the NEXT turn");
    const step6 = NORMAL_PROMPT.indexOf("Step 6 — Use `overrides`");
    const step7 = NORMAL_PROMPT.indexOf("Step 7 — Save with the COACH'S LITERAL LABEL");
    const step8 = NORMAL_PROMPT.indexOf("Step 8 — Brief post-save confirm");
    expect(step1).toBeGreaterThan(-1);
    expect(step2).toBeGreaterThan(step1);
    expect(step3).toBeGreaterThan(step2);
    expect(step4).toBeGreaterThan(step3);
    expect(step5).toBeGreaterThan(step4);
    expect(step6).toBeGreaterThan(step5);
    expect(step7).toBeGreaterThan(step6);
    expect(step8).toBeGreaterThan(step7);
  });

  it("Step 4 forbids calling compose_play in the route-read turn", () => {
    // The load-bearing accuracy gate: Cal must show the route map +
    // ASK + WAIT. No compose_play this turn. The coach gets to
    // verify hand-drawn route reads before geometry locks in.
    expect(NORMAL_PROMPT).toMatch(/Step 4 — WAIT\. CONFIRM THE ROUTE READS WITH THE COACH BEFORE COMPOSING/);
    expect(NORMAL_PROMPT).toMatch(/you do NOT call `compose_play` this turn/);
    expect(NORMAL_PROMPT).toMatch(/Did I read those right\?/);
  });

  it("commits to a 2-turn-per-play minimum cadence", () => {
    // The cadence is: route-read turn (Steps 2-4) THEN compose turn
    // (Steps 5-8). One-turn cycles are the failure mode.
    expect(NORMAL_PROMPT).toMatch(/TWO TURNS PER PLAY MINIMUM/);
    expect(NORMAL_PROMPT).toMatch(/route-read turn/);
    expect(NORMAL_PROMPT).toMatch(/compose turn/);
  });

  it("forbids inventing play names from prompt scaffolding or training data", () => {
    // Surfaced 2026-05-21: the previous prompt contained literal example
    // labels ("Noah / 67 / King / Vert Under / Money / Drive Pass") that
    // Cal recited as if they were in the current image. The CRITICAL
    // guard is the new rule that placeholders are not real labels.
    expect(NORMAL_PROMPT).toMatch(/DO NOT INVENT PLAY NAMES/);
    expect(NORMAL_PROMPT).toMatch(/PROMPT SCAFFOLDING, not real labels/);
    expect(NORMAL_PROMPT).toMatch(/only source of labels is the actual image/i);
  });

  it("does not bake specific team-named labels into the prompt as templates", () => {
    // The exact labels coaches use vary by team. The prompt must NOT
    // contain literal example play names that Cal could mistake for
    // labels in any given image. Specifically the labels that leaked
    // before — keep them out of the prompt body (the regression-
    // history note is the only place they're allowed, and even there
    // we no longer list them verbatim).
    //
    // Strip any line that says "labeled X, Y, Z, ..." with multiple
    // proper-noun-shaped labels — that's the scaffolding pattern that
    // taught Cal to recite them.
    expect(NORMAL_PROMPT).not.toMatch(/labeled Noah, 67, King, Vert Under, Money, Drive Pass/);
    expect(NORMAL_PROMPT).not.toMatch(/"Money"|"Drive Pass"|"Trips Plus"/);
  });

  it("explicitly requires saving under the coach's literal label, not the catalog name", () => {
    // Surfaced 2026-05-21: Cal composed a catalog concept for a play
    // labeled with the coach's team-specific name, then saved it
    // under the catalog name. Coach can't find their play by the
    // team's name. Step 6 must call this out.
    expect(NORMAL_PROMPT).toMatch(/Save with the COACH'S LITERAL LABEL, never the catalog concept name/i);
    expect(NORMAL_PROMPT).toMatch(/NEVER under the catalog concept name/);
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

  it("instructs Cal to use the COACH'S label, not the catalog concept name", () => {
    // The coach's team-specific label must be the saved title, not
    // the catalog concept Cal composed from. The team-specific name
    // is how the coach will find the play later.
    expect(NORMAL_PROMPT).toMatch(/COACH'S LITERAL LABEL/);
  });

  it("requires Cal to ASK when no catalog concept fits cleanly", () => {
    // Approximating with "closest-sounding" concept is the bug. The
    // prompt must explicitly tell Cal to surface uncertainty rather
    // than guess.
    expect(NORMAL_PROMPT).toMatch(/ASK; don't approximate/i);
    expect(NORMAL_PROMPT).toMatch(/closest-sounding/i);
  });

  it("structurally enforces no compose_play on the image-upload turn", () => {
    // After 2026-05-21 (round 2) the rule was tightened from "1
    // fence" to "0 fences" on the upload turn. The chat-time
    // validator gate A.0-IMAGE rejects any compose_play call when
    // the user's current turn includes an image. Composition can
    // only happen on a follow-up turn after the coach has confirmed
    // the per-player route reads.
    expect(NORMAL_PROMPT).toMatch(/NO `compose_play` ON THE IMAGE-UPLOAD TURN\. STRUCTURALLY ENFORCED/);
    expect(NORMAL_PROMPT).toMatch(/A\.0-IMAGE/);
    expect(NORMAL_PROMPT).toMatch(/OVERRIDES Rule 7c \(propose_plan/);
  });

  it("forbids calling propose_plan on image turns", () => {
    // The propose_plan workflow conflicts with the one-at-a-time
    // confirm flow image input requires. Surfaced 2026-05-21: Cal
    // called propose_plan + batched 6 compose_play in one turn.
    expect(NORMAL_PROMPT).toMatch(/DO NOT CALL `propose_plan` ON IMAGE TURNS/);
  });

  it("clarifies that 'yes' to Step 1 enumeration is NOT blanket approval", () => {
    // The failure mode Cal exhibited: coach said "yes" to the
    // enumeration in turn 1, Cal interpreted that as approval to
    // install all 6 plays. The prompt must explicitly call this out.
    expect(NORMAL_PROMPT).toMatch(/"YES" TO STEP 1 IS NOT BLANKET APPROVAL/);
  });

  it("provides a 2-turns-per-play worked example for image installs", () => {
    // The cadence: Turn 1 = enumerate plays, Turn 2 = route-read
    // for play 1 (no compose), Turn 3 = compose play 1, Turn 4 =
    // route-read for play 2, Turn 5 = compose play 2, …
    expect(NORMAL_PROMPT).toMatch(/WORKED EXAMPLE — multi-play image install \(2 turns per play\)/);
    expect(NORMAL_PROMPT).toMatch(/\*\*Turn 1 \(image attached\):\*\*/);
    expect(NORMAL_PROMPT).toMatch(/\*\*Turn 2 \(coach says "yes" \/ "go" \/ "play 1"\):\*\*/);
    expect(NORMAL_PROMPT).toMatch(/\*\*Turn 3 \(coach says "yes" \/ "correct/);
    // Turn 3 is where the FIRST compose_play happens.
    expect(NORMAL_PROMPT).toMatch(/Cal does Steps 5–8 for play #1/);
  });

  it("preserves the images-are-not-persisted rule", () => {
    // Cal must continue to acknowledge it can't see past-turn images
    // rather than fabricating from memory.
    expect(NORMAL_PROMPT).toMatch(/Images are NOT persisted/);
  });
});
