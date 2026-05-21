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
import { NORMAL_PROMPT, IMAGE_TURN_PROMPT, VISION_PASS_PROMPT } from "./agent";

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

describe("NORMAL_PROMPT — Rule 9b (image input, waypoint mode)", () => {
  // Surfaced 2026-05-20 / 21: a coach uploaded a hand-drawn play sheet
  // and Cal repeatedly produced wrong renderings. Three iterations:
  //   1. Cal mapped labels (Noah, Drive Pass, …) to catalog concepts
  //      whose names shared a word, then composed canonical geometry
  //      that had nothing to do with what was drawn.
  //   2. Tightened the prompt and structurally capped image turns at
  //      1 compose_play. Routes were still misread (curl mistaken for
  //      flat, in-route for slant, players silently relabeled).
  //   3. Tried a 2-turn-per-play coach-confirm workflow. Coach pushed
  //      back: "I don't want to have to review every player's route
  //      — I want the LLM to accurately represent the plays."
  //
  // Final approach: waypoint mode. Cal hand-authors the play fence
  // directly from the drawing — raw player positions and route
  // waypoints in yards. No catalog-concept categorization, no
  // place_offense, no compose_play. The whole categorization layer
  // that introduced error is gone. Vision model upgraded to Opus 4.7
  // for best chance at accurate first-pass reads.

  it("declares the drawing — not the label — as the source of truth", () => {
    expect(NORMAL_PROMPT).toMatch(/THE DRAWING IS THE TRUTH/);
    expect(NORMAL_PROMPT).toMatch(/LABEL IS JUST A NICKNAME/);
  });

  it("declares image input as WAYPOINT MODE explicitly", () => {
    // The header line tells Cal up-front that image input bypasses
    // the catalog-concept composition path. Without this, Cal falls
    // back to its default "compose_play with a concept" reflex.
    expect(NORMAL_PROMPT).toMatch(/IMAGE INPUT — WAYPOINT MODE/);
    expect(NORMAL_PROMPT).toMatch(/WHY WAYPOINT MODE/);
  });

  it("walks through the 5-step waypoint workflow in order", () => {
    const step1 = NORMAL_PROMPT.indexOf("Step 1 — Enumerate plays");
    const step2 = NORMAL_PROMPT.indexOf("Step 2 — CALIBRATE SCALE");
    const step3 = NORMAL_PROMPT.indexOf("Step 3 — Output structured coordinates directly");
    const step5 = NORMAL_PROMPT.indexOf("Step 5 — Emit the hand-authored play fence");
    const step6 = NORMAL_PROMPT.indexOf("Step 6 — Move to the next play");
    expect(step1).toBeGreaterThan(-1);
    expect(step2).toBeGreaterThan(step1);
    expect(step3).toBeGreaterThan(step2);
    expect(step5).toBeGreaterThan(step3);
    expect(step6).toBeGreaterThan(step5);
  });

  it("forbids prose categorization before encoding (no curl/slant/post intermediate)", () => {
    // Surfaced 2026-05-21 round 7: the prior anchored-observation
    // prose layer became a hallucination amplifier — Cal pattern-
    // matched to a concept, wrote prose for it, encoded waypoints
    // from the prose. Both the prose and the diagram diverged from
    // the drawing in a self-consistent way. The fix: skip prose
    // entirely; go from image directly to structured coordinates.
    expect(NORMAL_PROMPT).toMatch(/NO PROSE INTERMEDIATE/);
    expect(NORMAL_PROMPT).toMatch(/skip the prose layer/i);
    expect(NORMAL_PROMPT).toMatch(/NEVER characterize routes as concepts before emitting/);
  });

  it("Step 3 outputs structured coordinates (3a player list, 3b route list)", () => {
    // The new Step 3 splits into 3a (player coordinate list) and
    // 3b (route waypoint list) — both emitted as structured JSON
    // objects, not prose.
    expect(NORMAL_PROMPT).toMatch(/3a — Player coordinate list/);
    expect(NORMAL_PROMPT).toMatch(/3b — Route waypoint list/);
  });

  it("Step 2 requires scale calibration from yardlines / LOS / variant defaults", () => {
    // Without scale, Cal has no way to convert pixel distances into
    // yards. The user's specific insight: read yardline numbers,
    // LOS, and variant defaults BEFORE tracing any routes.
    expect(NORMAL_PROMPT).toMatch(/CALIBRATE SCALE/);
    expect(NORMAL_PROMPT).toMatch(/Yardline numbers/);
    expect(NORMAL_PROMPT).toMatch(/LOS line/);
    expect(NORMAL_PROMPT).toMatch(/Variant defaults for field width/);
  });

  it("instructs Cal to hand-author player positions in yards (not call place_offense)", () => {
    // Coach's drawing IS the formation — no canonical formation
    // lookup needed. The validator's place_offense mandatory gate
    // is bypassed when an image is attached.
    expect(NORMAL_PROMPT).toMatch(/Player coordinate list/);
    expect(NORMAL_PROMPT).toMatch(/DO NOT CALL THESE TOOLS ON IMAGE TURNS/);
    expect(NORMAL_PROMPT).toMatch(/`compose_play`, `place_offense`/);
  });

  it("describes route waypoints with explicit JSON shape (from + path + curve, no family)", () => {
    // Cal needs to know exactly which fields to emit. The hand-
    // authored fence uses pure custom_path routes — no family, no
    // route_kind. Without these guardrails Cal reverts to its
    // default route schema with family/depth.
    expect(NORMAL_PROMPT).toMatch(/"from": "<id>", "path": \[\[x1, y1\], \[x2, y2\], \.\.\.\], "curve": <bool>/);
    expect(NORMAL_PROMPT).toMatch(/No `family`, no `route_kind`/);
  });

  it("Step 3b enforces lateral component for non-vertical arrows", () => {
    // The collapse-to-vertical failure mode: Cal encoded all routes
    // as path: [[start_x, depth]] (vertical only) even when the
    // drawn arrow bent. The rule must explicitly require x change
    // when the arrow has lateral movement.
    expect(NORMAL_PROMPT).toMatch(/Lateral component MUST match the drawing/);
    expect(NORMAL_PROMPT).toMatch(/x change \(≥3yd between adjacent waypoints\) at the bend/);
  });

  it("Step 3b favors 3-5 waypoints per route to preserve shape detail", () => {
    // Surfaced 2026-05-21 round 8: Cal encoded every route as 1-2
    // waypoints (minimum-viable), so all rendered routes looked
    // like short straight arrows even when the drawn arrows had
    // distinctly different curves and bends. New default: 3-5
    // waypoints for non-straight routes, with a hard cap at 5.
    expect(NORMAL_PROMPT).toMatch(/Use 3.5 waypoints by default/);
    expect(NORMAL_PROMPT).toMatch(/Hard cap: 5 waypoints per route/);
    expect(NORMAL_PROMPT).toMatch(/trace the SHAPE, not just the destination/);
  });

  it("includes a self-check that catches collapse-to-vertical + pattern-matching bugs", () => {
    // The pre-emit self-check Cal runs: does the path have lateral
    // movement matching the arrow? Does it have enough waypoints
    // for the visible breaks? Do distinct arrows have distinct
    // paths?
    expect(NORMAL_PROMPT).toMatch(/Self-check before emitting/);
    expect(NORMAL_PROMPT).toMatch(/collapse-to-vertical bug/);
    expect(NORMAL_PROMPT).toMatch(/missing-break bug/);
    expect(NORMAL_PROMPT).toMatch(/pattern-match-to-concept bug/);
  });

  it("forbids compose_play / place_offense / get_route_template / propose_plan on image turns", () => {
    // The waypoint workflow REPLACES these tools for image input.
    // Calling them is the failure mode that produced wrong reads in
    // earlier iterations.
    expect(NORMAL_PROMPT).toMatch(/DO NOT CALL THESE TOOLS ON IMAGE TURNS/);
    expect(NORMAL_PROMPT).toMatch(/`compose_play`, `place_offense`, `get_route_template`, `get_concept_skeleton`, `propose_plan`/);
  });

  it("declares one-play-at-a-time as structurally enforced", () => {
    expect(NORMAL_PROMPT).toMatch(/ONE PLAY AT A TIME\. STRUCTURALLY ENFORCED/);
    expect(NORMAL_PROMPT).toMatch(/Emitting 2\+ fences gets rejected/);
  });

  it("explicitly requires saving under the coach's literal label, not a concept name", () => {
    expect(NORMAL_PROMPT).toMatch(/Save under the coach's literal label/);
    expect(NORMAL_PROMPT).toMatch(/Never invent a concept-sounding title/i);
  });

  it("forbids inventing plays, labels, players, or routes not in the image", () => {
    // Pattern Cal exhibited in earlier rounds: enumerating more
    // plays than were in the image, inventing routes for players
    // not drawn, hallucinating labels from prompt scaffolding.
    expect(NORMAL_PROMPT).toMatch(/DO NOT INVENT PLAYS, LABELS, PLAYERS, OR ROUTES/);
    expect(NORMAL_PROMPT).toMatch(/only source of truth is the photo attached to THIS turn/i);
  });

  it("does not bake specific team-named labels into the prompt as templates", () => {
    // The leaked labels regression: prompt examples must not include
    // literal play names that Cal could recite as if they were in
    // the actual image.
    expect(NORMAL_PROMPT).not.toMatch(/labeled Noah, 67, King, Vert Under, Money, Drive Pass/);
    expect(NORMAL_PROMPT).not.toMatch(/"Money"|"Drive Pass"|"Trips Plus"/);
  });

  it("preserves the images-are-not-persisted rule", () => {
    expect(NORMAL_PROMPT).toMatch(/IMAGES ARE NOT PERSISTED/i);
  });

  it("preserves the lobby-mode handoff (list_my_playbooks first)", () => {
    expect(NORMAL_PROMPT).toMatch(/NO ANCHORED PLAYBOOK\?/);
    expect(NORMAL_PROMPT).toMatch(/Call `list_my_playbooks` first/);
  });
});

describe("IMAGE_TURN_PROMPT — focused image-only system prompt", () => {
  // Surfaced 2026-05-21 round 10: coach's hypothesis — Cal can SEE
  // the hand-drawn routes correctly (Opus 4.7 confirmed in a parallel
  // chat) but the JSON output is pattern-matched to "play-shaped"
  // generic geometry. Likely cause: prompt-context dilution — the
  // model's attention splits across hundreds of unrelated Cal rules
  // (KB, scheduling, defense composition, color rules, etc.) when
  // generating waypoints, leaving little focus for the vision task.
  //
  // Fix: a separate, focused system prompt used ONLY on image-upload
  // turns. ~80 lines vs the normal ~700+. Strips everything that
  // doesn't apply to image-tracing. Text-only turns are untouched —
  // they keep using NORMAL_PROMPT.

  it("is dramatically shorter than NORMAL_PROMPT (frees attention for vision)", () => {
    // If the focused prompt grows back toward NORMAL_PROMPT's size,
    // the whole point of this fix is defeated.
    expect(IMAGE_TURN_PROMPT.length).toBeLessThan(NORMAL_PROMPT.length / 4);
  });

  it("opens with identity scoped to the image task", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/^You are Coach Cal helping a football coach digitize a hand-drawn play sheet/);
    expect(IMAGE_TURN_PROMPT).toMatch(/This is your ONE job this turn/);
  });

  it("includes the no-narration rule", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/NEVER NARRATE THE WORKFLOW/);
    expect(IMAGE_TURN_PROMPT).toMatch(/TEST THE FIRST SENTENCE/);
  });

  it("includes the no-prose-categorization rule (direct image → coordinates)", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/Skip prose categorization/);
    expect(IMAGE_TURN_PROMPT).toMatch(/Do NOT classify routes as catalog families/);
  });

  it("includes the 3-5 waypoint fidelity rule", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/Use 3-5 waypoints by default/);
    expect(IMAGE_TURN_PROMPT).toMatch(/Hard cap: 5 waypoints per route/);
  });

  it("includes the roster-parity gate (every non-QB has a route entry)", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/ROSTER ↔ ROUTES PARITY/);
    expect(IMAGE_TURN_PROMPT).toMatch(/stub release/);
  });

  it("includes the one-play-per-turn cap", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/ONE PLAY PER TURN/);
    expect(IMAGE_TURN_PROMPT).toMatch(/exactly 1 play fence per reply/);
  });

  it("forbids compose_play / place_offense / get_route_template / propose_plan", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/FORBIDDEN ON IMAGE TURNS/);
    expect(IMAGE_TURN_PROMPT).toMatch(/`compose_play`, `place_offense`, `get_route_template`, `get_concept_skeleton`, `propose_plan`/);
  });

  it("preserves the lobby-mode handoff to list_my_playbooks", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/`list_my_playbooks`/);
  });

  it("does NOT contain unrelated Cal rules (KB curation, scheduling, defense, plans)", () => {
    // The whole point of the focused prompt is to strip these. If
    // they sneak back in, the context-dilution fix is defeated.
    // (propose_plan is mentioned ONCE in the FORBIDDEN tools list — that's fine.
    //  The hazard is workflow rules about these tools, not naming them as forbidden.)
    expect(IMAGE_TURN_PROMPT).not.toMatch(/edit_kb_entry|add_kb_entry|retire_kb_entry/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/create_event|create_practice_plan/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/compose_defense|place_defense/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/update_plan_step/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/Admin Training Mode/);
  });

  it("does NOT contain specific team-named labels (regression from rounds 4-5)", () => {
    // Same hazard as NORMAL_PROMPT — example labels Cal could
    // mistakenly recite as if they were in the current image.
    expect(IMAGE_TURN_PROMPT).not.toMatch(/labeled Noah, 67, King, Vert Under, Money, Drive Pass/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/"Money"|"Drive Pass"|"Trips Plus"/);
  });

  it("documents the VISION READ anchor when the pre-flight pass produces observations", () => {
    // Pass 1 (VISION_PASS_PROMPT) runs separately and produces a
    // structured per-player observation list. The main agent's
    // IMAGE_TURN_PROMPT must know how to use those observations as
    // anchor data — otherwise pass 1 is wasted work.
    expect(IMAGE_TURN_PROMPT).toMatch(/VISION READ ANCHOR/);
    expect(IMAGE_TURN_PROMPT).toMatch(/use it as your ANCHOR for waypoint encoding/);
    expect(IMAGE_TURN_PROMPT).toMatch(/When VISION READ is absent: fall back to reading the image directly/);
  });
});

describe("VISION_PASS_PROMPT — pre-flight vision-only system prompt", () => {
  // Surfaced 2026-05-21 round 11: even the focused IMAGE_TURN_PROMPT
  // (round 10) wasn't enough — Cal still produced pattern-matched
  // routes because vision + reasoning + JSON happens in one forward
  // pass. Coach's framing: it's a translation error between
  // understanding and generating. Pass 1 separates the two: a
  // separate LLM call with just the image and a tiny prompt does
  // vision ONLY; the main loop then has anchor data to translate
  // into the fence.

  it("declares the single task: structured JSON observation, nothing else", () => {
    expect(VISION_PASS_PROMPT).toMatch(/SINGLE TASK this turn: look at the image and output a structured JSON array/);
  });

  it("forbids prose, categorization, and play-name guessing in the vision read", () => {
    expect(VISION_PASS_PROMPT).toMatch(/NO prose narration/);
    expect(VISION_PASS_PROMPT).toMatch(/NO catalog play names/);
    expect(VISION_PASS_PROMPT).toMatch(/NO route family names/);
    // Spot-check that common family names are explicitly banned.
    expect(VISION_PASS_PROMPT).toMatch(/curl \/ slant \/ post/);
  });

  it("requires geometric route observations (direction / distance / turns)", () => {
    expect(VISION_PASS_PROMPT).toMatch(/GEOMETRIC description of the arrow/);
    expect(VISION_PASS_PROMPT).toMatch(/direction \(up \/ left \/ right \/ diagonal\)/);
    expect(VISION_PASS_PROMPT).toMatch(/distance \(in yards\)/);
  });

  it("documents UNCLEAR as the answer when the model can't read confidently", () => {
    // The whole point of pass 1 is to catch confabulation BEFORE
    // it becomes structured output. The "UNCLEAR" escape hatch
    // lets the model honestly say "I can't see this" instead of
    // making something up.
    expect(VISION_PASS_PROMPT).toMatch(/UNCLEAR/);
    expect(VISION_PASS_PROMPT).toMatch(/silent confabulation/i);
  });

  it("requires the output to start with `[` (parseable JSON array)", () => {
    // performImageVisionPass uses this prefix as a sanity check —
    // if the model emits prose despite instructions, we skip the
    // injection rather than feed garbage into the system prompt.
    expect(VISION_PASS_PROMPT).toMatch(/Start your reply with \[ and end with \]/);
  });

  it("requires Q (the QB) and C (the center) to always be included", () => {
    // These are often unlabeled in the drawing but the main agent's
    // roster-parity gate expects them in players[].
    expect(VISION_PASS_PROMPT).toMatch(/Always include @Q \(the QB\) and @C \(the center\), even if unlabeled/);
  });

  it("forbids relabeling players (Y stays Y, not S)", () => {
    // Failure mode from earlier rounds: Cal silently turned the
    // coach's @Y into @S in its own roster. Pass 1 must preserve
    // the labels from the drawing.
    expect(VISION_PASS_PROMPT).toMatch(/do not relabel/);
  });

  it("is dramatically shorter than NORMAL_PROMPT and even shorter than IMAGE_TURN_PROMPT", () => {
    // Pass 1's whole value is attentional focus on the image. The
    // prompt must stay tight.
    expect(VISION_PASS_PROMPT.length).toBeLessThan(IMAGE_TURN_PROMPT.length);
    expect(VISION_PASS_PROMPT.length).toBeLessThan(NORMAL_PROMPT.length / 8);
  });
});
