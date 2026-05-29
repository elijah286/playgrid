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
import {
  NORMAL_PROMPT,
  IMAGE_TURN_PROMPT,
  VISION_PASS_PROMPT,
  LAYOUT_DETECTION_PROMPT,
  PER_CROP_VISION_PROMPT,
  contextBlock,
} from "./agent";
import type { ToolContext } from "./tools";

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

describe("IMAGE_TURN_PROMPT — fence-only emit on image turns (round 12)", () => {
  // Surfaced 2026-05-21 round 12: even with the focused IMAGE_TURN_PROMPT
  // (round 10) + numeric pass-1 (round 11), Cal still pattern-matched
  // routes ("3-vertical look") because pass-2 generated PROSE about
  // the routes alongside the fence. Prose-shaped output triggered
  // catalog priors that biased the fence's waypoints.
  //
  // Round-12 fix: pass-2 emits ONLY the fence. No "What's drawn"
  // bullets, no concept names, no coaching paragraph. Coaching notes
  // come from the saved play via projectSpecToNotes — the SAME
  // pipeline the "Generate notes" button uses for any coach-drawn
  // play. Cal in the image turn is a fence-router, not a coach-writer.

  it("is dramatically shorter than NORMAL_PROMPT (frees attention for the image)", () => {
    expect(IMAGE_TURN_PROMPT.length).toBeLessThan(NORMAL_PROMPT.length / 4);
  });

  it("opens by establishing pass-2 as a fence emitter for ALL plays in turn 1", () => {
    // Round 13 evening: pass-2 emits every fence from VISION READ
    // in this one reply, not one per turn. Eliminated the lossy
    // multi-turn walkthrough where turns 2-N regenerated from
    // history without vision context.
    expect(IMAGE_TURN_PROMPT).toMatch(/processing a hand-drawn play sheet photo/);
    expect(IMAGE_TURN_PROMPT).toMatch(/A separate per-play vision pass has ALREADY translated/);
    expect(IMAGE_TURN_PROMPT).toMatch(/EMIT ALL fences in this single reply/);
  });

  it("explicitly forbids route-describing prose and concept naming", () => {
    // The bug round 12 fixes: Cal emitted "What's drawn: X arcs inside
    // and up to 6yd... This is a 3-vertical look..." alongside the
    // fence. The prose biased the fence's waypoints (Z stretched to
    // match the "3-vertical" mental model). New rule: no route prose
    // in the image turn, period.
    expect(IMAGE_TURN_PROMPT).toMatch(/You do NOT describe routes/);
    expect(IMAGE_TURN_PROMPT).toMatch(/You do NOT write "What's drawn:" bullets/);
    expect(IMAGE_TURN_PROMPT).toMatch(/Classify any play as a known concept/);
    // Spot-check that common concept names are explicitly called out as
    // forbidden — these are the priors that bias the waypoints.
    expect(IMAGE_TURN_PROMPT).toMatch(/"3-vert", "Mesh", "Smash", "Y-stick"/);
  });

  it("delegates coaching notes to the post-save projection pipeline", () => {
    // The architectural separation the coach asked for: routes come
    // FROM the image; prose comes FROM the saved play. The prompt
    // must say this explicitly so Cal doesn't sneak coaching
    // paragraphs back in.
    expect(IMAGE_TURN_PROMPT).toMatch(/generated DOWNSTREAM from the saved play/);
    expect(IMAGE_TURN_PROMPT).toMatch(/auto-save block will persist all of them and append the projected notes/);
  });

  it("specifies the emit-all-in-one-reply shape (intro + fence-per-play, no Ready prompt)", () => {
    // Round-13 evening: the one-play-per-turn walkthrough was
    // dropped because turns 2-N fell back to NORMAL_PROMPT without
    // per-crop vision context, causing plays to converge toward a
    // template AND duplicating "Saved: X" lines. Cal now emits ALL
    // fences in turn 1; coach revises individuals via revise_play.
    expect(IMAGE_TURN_PROMPT).toMatch(/REPLY SHAPE/);
    expect(IMAGE_TURN_PROMPT).toMatch(/EMIT ALL PLAYS IN THIS TURN/);
    expect(IMAGE_TURN_PROMPT).toMatch(/Here they are/);
    // The old per-play "Ready for [next]?" prompt is gone — it
    // was the trigger for the lossy NORMAL_PROMPT walkthrough.
    expect(IMAGE_TURN_PROMPT).not.toMatch(/Ready for \[next label\]\?/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/walk through plays ONE AT A TIME/);
  });

  it("includes variant-aware roster parity (preserved across the refactor)", () => {
    // Variant eligibility still mirrors validateCenterEligibility in
    // play-content-validate.ts: C eligible in 5v5 only.
    expect(IMAGE_TURN_PROMPT).toMatch(/flag_5v5: Q exempt; C eligible/);
    expect(IMAGE_TURN_PROMPT).toMatch(/flag_7v7 \/ tackle_11: both Q and C exempt/);
  });

  it("explicitly forbids Cal from emitting its own 'Saved: ...' lines", () => {
    // Surfaced 2026-05-21 evening: on multi-turn walkthroughs, Cal
    // (now on NORMAL_PROMPT after turn 1 since the image is no
    // longer in history) started mimicking the harness "Saved: X"
    // suffix it had seen in chat history. Result: duplicated
    // "Saved: X" lines in the chat output. The emit-all-in-turn-1
    // model dodges this structurally, but the prompt also names
    // it explicitly so future regressions stay caught.
    expect(IMAGE_TURN_PROMPT).toMatch(/Emit "Saved: \.\.\." \/ "Saved play X" \/ "Added X to your playbook"/);
    expect(IMAGE_TURN_PROMPT).toMatch(/harness appends its OWN "Saved N plays" suffix/);
  });

  it("does NOT tell Cal to add a stub route for the center in 7v7", () => {
    // Surfaced 2026-05-21: prior prompt said "Center in 7v7: often
    // stationary in the drawing — give it the stub", contradicting
    // the validator's centerIsEligible:false default for 7v7.
    expect(IMAGE_TURN_PROMPT).not.toMatch(/Center in 7v7.*give it the stub/);
  });

  it("forbids compose_play / place_offense / get_route_template / propose_plan on image turns", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/FORBIDDEN TOOLS ON IMAGE TURNS/);
    expect(IMAGE_TURN_PROMPT).toMatch(/`compose_play`, `place_offense`, `get_route_template`, `get_concept_skeleton`, `propose_plan`/);
  });

  it("preserves the lobby-mode handoff to list_my_playbooks", () => {
    expect(IMAGE_TURN_PROMPT).toMatch(/`list_my_playbooks`/);
  });

  it("does NOT contain unrelated Cal rules (KB curation, scheduling, defense, plans)", () => {
    expect(IMAGE_TURN_PROMPT).not.toMatch(/edit_kb_entry|add_kb_entry|retire_kb_entry/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/create_event|create_practice_plan/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/compose_defense|place_defense/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/update_plan_step/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/Admin Training Mode/);
  });

  it("does NOT contain specific team-named labels (regression from rounds 4-5)", () => {
    expect(IMAGE_TURN_PROMPT).not.toMatch(/labeled Noah, 67, King, Vert Under, Money, Drive Pass/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/"Money"|"Drive Pass"|"Trips Plus"/);
  });

  it("does NOT include round-11 prose route-description rules (moved to pass-1 numeric)", () => {
    // Round 11 had IMAGE_TURN_PROMPT doing waypoint encoding itself
    // (3-5 waypoints, pre-route motion as first waypoints, etc.).
    // Round 12 moves that to pass-1's numeric output; pass-2 just
    // emits the result. If these old rules creep back in, pass-2
    // starts re-encoding and the prose-bias regression returns.
    expect(IMAGE_TURN_PROMPT).not.toMatch(/Use 3-5 waypoints by default/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/Pre-route motion belongs IN the path/);
    expect(IMAGE_TURN_PROMPT).not.toMatch(/Skip prose categorization/);
  });
});

describe("VISION_PASS_PROMPT — numeric image-to-fence translation (round 12)", () => {
  // Round 12 (2026-05-21): pass-1 now produces COMPLETE play fences
  // with numeric routes (path: [[x,y],...] + curve flag) directly
  // from the image. The previous shape (route_observation: prose)
  // re-introduced categorical thinking downstream — words like
  // "shallow arc" or "stem release" invoke catalog priors even when
  // accurate, so the downstream pass collapsed distinct routes into
  // matching concept-shaped geometry. The new shape gives the model
  // nothing to pattern-match against.
  //
  // The coach's prescribed 5-step flow is embedded in the prompt:
  //   1. Place players (numeric x/y)
  //   2. Estimate field scale (visual anchors)
  //   3. Define routes by anchor points (paths + curve flag)
  //   4. Self-validate (iterate if anything's off)
  //   5. NOTES ARE NOT THIS PASS'S JOB (downstream from saved play)

  it("declares the single task: numeric fence emission, nothing else", () => {
    expect(VISION_PASS_PROMPT).toMatch(/translating a hand-drawn football play sheet photo into structured numeric data/);
    expect(VISION_PASS_PROMPT).toMatch(/This is your ONLY job/);
    expect(VISION_PASS_PROMPT).toMatch(/Numbers only\. No prose about the routes/);
  });

  it("forbids prose route descriptions, concept names, and family names", () => {
    expect(VISION_PASS_PROMPT).toMatch(/NO coaching notes/);
    expect(VISION_PASS_PROMPT).toMatch(/NO catalog play names/);
    expect(VISION_PASS_PROMPT).toMatch(/NO route family names/);
    // Spot-check that the priors are explicitly named so the model
    // can pattern-match its own forbidden output.
    expect(VISION_PASS_PROMPT).toMatch(/Mesh \/ Smash \/ Snag \/ 3-vertical/);
    expect(VISION_PASS_PROMPT).toMatch(/curl \/ slant \/ post \/ dig \/ out \/ in \/ drag \/ corner/);
  });

  it("walks through the 5-step translation flow", () => {
    expect(VISION_PASS_PROMPT).toMatch(/Step 1 — Place the players/);
    expect(VISION_PASS_PROMPT).toMatch(/Step 2 — Estimate field scale/);
    expect(VISION_PASS_PROMPT).toMatch(/Step 3 — Define routes by anchor points/);
    expect(VISION_PASS_PROMPT).toMatch(/Step 4 — Self-validate/);
    // Step 5 explicitly says notes are NOT this pass's job.
    expect(VISION_PASS_PROMPT).toMatch(/Step 5 is NOT your job/);
    expect(VISION_PASS_PROMPT).toMatch(/Coaching notes.*get generated separately/);
  });

  it("specifies how to encode routes (anchor points, curve flag, no start-dot repeat)", () => {
    // Anchor-based encoding is the new core: every direction change
    // + curve samples + endpoint. 3-5 anchors typical, 1-2 for
    // straight arrows, up to 5 for complex shapes.
    expect(VISION_PASS_PROMPT).toMatch(/ANCHOR POINTS/);
    expect(VISION_PASS_PROMPT).toMatch(/curve: true.*rounded \/ arc-shaped/);
    expect(VISION_PASS_PROMPT).toMatch(/Don't repeat the start dot as path\[0\]/);
  });

  it("requires pre-route motion (bubbles / dips / duck-unders) in the path", () => {
    // Surfaced 2026-05-21 (Noah play): X had a bubble-under-B at the
    // start, but the encoding collapsed it to a straight diagonal.
    // Pre-route motion lives in the FIRST anchors, not as separate
    // prose. If the arrow loops at its start, the first path entries
    // encode the loop.
    expect(VISION_PASS_PROMPT).toMatch(/Pre-route motion belongs IN the path/);
    expect(VISION_PASS_PROMPT).toMatch(/bubble under another receiver/);
    expect(VISION_PASS_PROMPT).toMatch(/Truncating pre-route motion/);
  });

  it("requires self-validation against the image before emitting", () => {
    // Step 4 of the coach's prescribed flow: don't emit until you've
    // checked endpoint match, relative depths, origin loops, and
    // curve flag against the image. Iterate if anything's off.
    expect(VISION_PASS_PROMPT).toMatch(/Endpoint match/);
    expect(VISION_PASS_PROMPT).toMatch(/Relative depths/);
    expect(VISION_PASS_PROMPT).toMatch(/Origin loops/);
    expect(VISION_PASS_PROMPT).toMatch(/If anything fails, mentally re-run steps 1-3/);
  });

  it("describes relative-depth checking without prescribing 'calibrate to deepest'", () => {
    // Round 11's rule said "Calibrate against the deepest arrow,
    // then derive everything else's depth proportionally to it" —
    // which over-corrected and caused Cal to flatten distinct
    // routes (Z stretched to match Y's seam). Round 12's softer
    // wording: preserve observed ordering, don't flatten distinct
    // routes into identical paths.
    expect(VISION_PASS_PROMPT).not.toMatch(/Calibrate against the deepest arrow/);
    expect(VISION_PASS_PROMPT).toMatch(/If two arrows end at distinctly different depths but your output has them identical, you've flattened/);
  });

  it("requires the output to be a JSON array starting with `[` (parseable)", () => {
    expect(VISION_PASS_PROMPT).toMatch(/Start your reply with `\[`, end with `\]`/);
    expect(VISION_PASS_PROMPT).toMatch(/NO markdown fences/);
    expect(VISION_PASS_PROMPT).toMatch(/NO prose before or after/);
  });

  it("specifies the fence shape with players[] and routes[] arrays", () => {
    // The numeric output IS a play fence — title + players + routes.
    // No `route_observation`, no `position_anchor`, no `scale_note`
    // — those were the prose fields that re-introduced bias.
    expect(VISION_PASS_PROMPT).toMatch(/"title":\s*"<coach's literal label/);
    expect(VISION_PASS_PROMPT).toMatch(/"players":\s*\[/);
    expect(VISION_PASS_PROMPT).toMatch(/"routes":\s*\[/);
    expect(VISION_PASS_PROMPT).toMatch(/"path":\s*\[\[<x>,\s*<y>\]/);
    expect(VISION_PASS_PROMPT).toMatch(/"curve":\s*<bool>/);
  });

  it("does NOT include the round-11 prose route_observation field", () => {
    // The whole point of round 12: kill the prose intermediate. If
    // route_observation creeps back in, the bias regression returns.
    expect(VISION_PASS_PROMPT).not.toMatch(/route_observation/);
    expect(VISION_PASS_PROMPT).not.toMatch(/GEOMETRIC description of the arrow/);
    expect(VISION_PASS_PROMPT).not.toMatch(/position_anchor/);
    expect(VISION_PASS_PROMPT).not.toMatch(/scale_note/);
  });

  it("includes variant-aware roster parity (Q always exempt; C in 5v5 only)", () => {
    // Pass-1 produces a fence that will hit the save-time roster-
    // parity validator. The prompt must agree with the validator's
    // centerIsEligible:false default for 7v7 / tackle_11.
    expect(VISION_PASS_PROMPT).toMatch(/flag_5v5.*@Q is exempt.*@C IS eligible/);
    expect(VISION_PASS_PROMPT).toMatch(/flag_7v7.*@Q AND @C are both exempt/);
  });

  it("requires Q (the QB) and C (the center) to always be in players[]", () => {
    expect(VISION_PASS_PROMPT).toMatch(/Always include @Q \(typically y ≈ -3 to -5\) and @C/);
  });

  it("forbids relabeling players (Y stays Y, not S)", () => {
    expect(VISION_PASS_PROMPT).toMatch(/Do NOT relabel/);
  });

  it("provides an explicit escape hatch for unclear routes (omit, don't confabulate)", () => {
    // Round-11 prompt used "UNCLEAR" sentinels in route_observation.
    // Round-12 numeric output omits the route entry entirely if
    // the arrow can't be read; the downstream save flow surfaces
    // missing routes to the coach for manual fix.
    expect(VISION_PASS_PROMPT).toMatch(/OMIT it from `routes\[\]` rather than confabulate/);
  });

  it("stays smaller than NORMAL_PROMPT/3 (attention focus is the whole point)", () => {
    // Pass-1's value is undivided attention on the image. The 5-step
    // flow adds bulk vs round 11 — soft cap is /3 rather than /8.
    expect(VISION_PASS_PROMPT.length).toBeLessThan(NORMAL_PROMPT.length / 3);
  });
});

describe("LAYOUT_DETECTION_PROMPT — per-play bounding-box detection (round 13)", () => {
  // Round 13 (2026-05-21): the single-shot vision pass couldn't
  // discriminate small details in a full-sheet photo (the
  // model sees ~30-40 pixels per play box, not enough to trace a
  // 2yd hook). Per-play cropping addresses this: detect each
  // play's bounding box, crop the source, run pass-1 per crop.
  //
  // This prompt is the FIRST step of the new pipeline. Its only
  // job is to find the play boxes; route tracing is downstream.

  it("declares the single task: identify play bounding boxes, nothing else", () => {
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/SINGLE TASK this turn: identify the bounding box of each play/);
  });

  it("forbids route tracing, player counting, and coaching prose", () => {
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/NO route tracing/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/NO player counts/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/NO coaching notes/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/NO catalog play names/);
  });

  it("specifies the bbox output shape (label + normalized x/y/w/h)", () => {
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/"label":/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/"bbox":/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/"x":\s*<number, 0 to 1/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/"y":\s*<number, 0 to 1/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/"w":\s*<number, 0 to 1/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/"h":\s*<number, 0 to 1/);
  });

  it("requires bboxes to stay within image bounds and not overlap", () => {
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/bbox\.x \+ bbox\.w must NOT exceed 1\.0/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/bbox\.y \+ bbox\.h must NOT exceed 1\.0/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/Play boxes must NOT overlap/);
  });

  it("explicitly requires capturing pre-snap motion / dashed lines + a 5-10% margin", () => {
    // Round-13 surface: tight bboxes clipped pre-snap motion
    // arrows, downstream vision saw a player with no route, and
    // emitted a stub. The prompt now calls out motion lines AND
    // a concrete margin (instead of "a little margin").
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/pre-snap motion lines/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/Include a 5-10% margin/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/Better to be slightly loose than tight/);
  });

  it("requires output to start with [ for parsing safety", () => {
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/Start your reply with \[ and end with \]/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/NO markdown fences/);
  });

  it("preserves coach-style labels verbatim", () => {
    // Same hazard as VISION_PASS_PROMPT — label normalization
    // ("noah" → "Noah") loses the coach's intent.
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/exactly as written/);
    expect(LAYOUT_DETECTION_PROMPT).toMatch(/do not normalize/);
  });

  it("stays small (focused detection prompt, not full Cal context)", () => {
    expect(LAYOUT_DETECTION_PROMPT.length).toBeLessThan(NORMAL_PROMPT.length / 6);
  });
});

describe("PER_CROP_VISION_PROMPT — per-crop single-play translation (round 13)", () => {
  // After cropping, each LLM call sees exactly ONE play. The
  // output shape changes from "JSON array of fences" (full sheet)
  // to "single JSON object" (one play). Same 5-step flow as
  // VISION_PASS_PROMPT, scoped to a single play.

  it("declares the single task: one play in this image, output a single fence", () => {
    expect(PER_CROP_VISION_PROMPT).toMatch(/The image contains EXACTLY ONE play/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Output is a single JSON object/);
  });

  it("requires the output to start with { (single object, not array)", () => {
    // The aggregation step wraps the per-crop outputs in [...].
    // If a per-crop call returns an array, the wrap-step produces
    // malformed JSON. Validator catches this; prompt must agree.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Start your reply with `\{`, end with `\}`/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Do NOT wrap in an array/);
  });

  it("treats title as a placeholder; caller stamps the label post-trace", () => {
    // Round-13 fix (2026-05-21 evening): passing the label as a
    // pre-trace hint made Opus template-lock to its trained
    // priors on common play names ("Noah", "King", "Drive Post"
    // all collapsed to a generic spread-offense template). The
    // fix: the per-crop call gets only pixels, emits with a
    // placeholder title, and the caller stamps the real label
    // AFTER the trace so it can't bias geometry.
    expect(PER_CROP_VISION_PROMPT).toMatch(/title.*placeholder/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/caller will replace it/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Pixels only/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Even if you recognize a play name, ignore it/);
  });

  it("inherits the 5-step flow from VISION_PASS_PROMPT", () => {
    // The flow stays the same — only the output shape changes.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Step 1 — Place the players/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Step 2 — Estimate field scale/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Step 3 — Define routes by anchor points/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Step 4 — Self-validate/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Step 5 is NOT your job/);
  });

  it("forbids prose route descriptions and concept names (same as VISION_PASS_PROMPT)", () => {
    expect(PER_CROP_VISION_PROMPT).toMatch(/NO catalog play names/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/NO route family names/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Mesh \/ Smash \/ Snag \/ 3-vertical/);
  });

  it("requires pre-route motion and relative-depth checks (same as VISION_PASS_PROMPT)", () => {
    expect(PER_CROP_VISION_PROMPT).toMatch(/Pre-route motion belongs IN the path/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Relative depths/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Origin loops/);
  });

  it("has hard format rules at the top of Step 3 with wrong/correct examples", () => {
    // Round-13 evening regression: after the generalization refactor,
    // Cal was emitting routes with the player's own position as the
    // first anchor (e.g. X at (-10,0) emitted path [[-10,0],[-8,5],...]).
    // The "don't repeat start dot" rule existed but was buried in the
    // middle of Step 3. Fix: surface the structural rules at the TOP
    // of Step 3 with concrete wrong/correct JSON examples. These
    // examples are about FORMAT, not specific route shapes, so no
    // over-fit risk.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Hard format rules/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/RULE 1.*path.*does NOT include the player's starting position/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/✗ WRONG/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/✓ CORRECT/);
  });

  it("emphasizes EVERY non-QB gets a route, even backfield receivers (RULE 2)", () => {
    // Same regression: Cal omitted @B from routes[] when B was placed
    // in the backfield (y < 0). Validator rejected 3 plays. RULE 2
    // makes the eligibility crystal clear: only @Q (and @C in 7v7/
    // tackle_11) are exempt. Backfield position doesn't change that.
    expect(PER_CROP_VISION_PROMPT).toMatch(/RULE 2.*Every non-QB player gets a `routes\[\]` entry/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/no exceptions for backfield position/);
  });

  it("guides the curve flag toward true for 3+ anchor routes (RULE 3)", () => {
    // Same regression: Cal was emitting curve:false for almost
    // every route, even ones with 3+ anchors that should be smooth.
    // false renders polygonal segments between anchors. Guide Cal
    // to prefer true when in doubt with 3+ anchors.
    expect(PER_CROP_VISION_PROMPT).toMatch(/RULE 3.*curve/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/When in doubt with 3\+ anchors, prefer `true`/);
  });

  it("encourages MORE waypoints per route (typical 5-8, up to 12 for complex)", () => {
    // Surfaced 2026-05-21: Cal encoded most routes with 2-3
    // anchors, which collapsed curves into straight segments.
    // Coach feedback: "we need more points on the routes to ensure
    // they are accurate." Updated guidance: 5-8 typical (not 3-5),
    // up to 12 for complex shapes (not 5), with explicit "more is
    // almost always better than fewer" framing.
    expect(PER_CROP_VISION_PROMPT).toMatch(/5-8 anchors is typical/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/up to 12 for complex multi-segment shapes/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/More anchors are almost always better than fewer/);
  });

  it("Step 4 includes a render check (mentally re-render and verify)", () => {
    // The highest-leverage self-validate: imagine the route rendered
    // (straight segments for curve:false, spline for curve:true) and
    // check that the result reproduces the drawn arrow. If it
    // doesn't match, add more anchors at the problem spots.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Render check/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/mentally render its path the way the diagram will display it/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/you need MORE ANCHORS/);
  });

  it("teaches dashed lines = pre-snap motion (round 13 bbox-tuning fix)", () => {
    // The Noah play's X has a dashed motion line going behind B
    // pre-snap. Round-13 per-crop failed to capture this as part
    // of the route — Cal emitted a stub for X. The fix tells Cal
    // that dashed lines ARE the route's start, not decoration.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Dashed lines = pre-snap motion/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/NEVER drop a dashed line/);
  });

  it("uses a SHAPE-CATEGORY taxonomy (not specific coordinates) for arrow encoding", () => {
    // 2026-05-21 evening: coach pushed back on Noah-specific
    // coordinate examples — "I want robustness, not a one-play
    // fix." The earlier worked example pinned specific waypoints
    // [[-10,-1],[-7,0],[-5,2],[-3,5]] for Noah's X bubble + drag.
    // Risk: model anchors to those exact coordinates for ANY
    // bubble-style route, regardless of where the actual arrow
    // ends in the image. Refactored to abstract shape categories
    // with encoding rules (anchor count + curve flag), no
    // specific coordinates. The (x, y) numbers come from the
    // image, not from these categories.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Route shape taxonomy/);
    // Categories cover the common shapes Cal will encounter.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Straight line, one direction/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Single sharp break/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Continuous rounded curve/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Multi-segment with 2\+ direction changes/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Pre-snap motion \+ main route/);
  });

  it("explicitly forbids substituting catalog shapes / training-memory depths", () => {
    // The core anti-over-fit rule. Cal must read coordinates from
    // the image, not substitute "standard" depths or laterals
    // from its training memory of common routes.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Coordinates come from the image, not from these categories/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Do not substitute a "typical" depth or lateral/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Substituting a catalog shape/);
  });

  it("does NOT contain Noah-specific coordinates that risk over-fitting", () => {
    // The earlier worked example had hardcoded waypoints from
    // Noah's X route. With those gone, Cal can't pattern-match
    // a new bubble route to "the Noah numbers".
    expect(PER_CROP_VISION_PROMPT).not.toMatch(/\[-10, -1\], \[-7, 0\], \[-5, 2\], \[-3, 5\]/);
    expect(PER_CROP_VISION_PROMPT).not.toMatch(/Worked example: bubble-under-B/);
  });

  it("Step 4 includes a coordinate-provenance check (no training-memory substitution)", () => {
    // The strongest single self-check against over-fitting:
    // every coordinate must be traceable to a specific arrow
    // segment in the image. Guesses and priors fail this gate.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Coordinate provenance/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/point to the specific arrow segment that determined each anchor/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Catalog-substitution check/);
  });

  it("forbids stub-when-confused (the #1 round-13 failure mode)", () => {
    // Cal's failure was: if a route's geometry was unclear, emit
    // a stub `[[<x>, 1]]` instead of partial trace. That silently
    // converts "I can't read this" into "this player is stationary",
    // which is misleading. The rule: ANY visible arrow → route
    // entry, partial trace ok, never stub.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Any visible arrow → a route entry/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Never stub a player who clearly has lines drawn/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/Stub-check/);
  });

  it("warns about cross-arrow bleed in the self-validate step", () => {
    // Round-13 surface: Y's path zigzagged through positions that
    // overlapped Z's vertical, suggesting Cal was tracing the
    // wrong arrow. The new self-check tells Cal to re-verify
    // arrow-to-player attribution when paths zigzag oddly.
    expect(PER_CROP_VISION_PROMPT).toMatch(/Cross-arrow bleed/);
  });

  it("includes variant-aware roster parity (Q always exempt; C in 5v5 only)", () => {
    expect(PER_CROP_VISION_PROMPT).toMatch(/flag_5v5.*@Q is exempt.*@C IS eligible/);
    expect(PER_CROP_VISION_PROMPT).toMatch(/flag_7v7.*@Q AND @C are both exempt/);
  });
});

describe("NORMAL_PROMPT — SPEC EMISSION (Phase 2c, 2026-05-24)", () => {
  // Phase 2b makes hand-authored play fences structurally impossible
  // to ship; Phase 2c teaches Cal the new emission shape (```spec).
  // These tests pin the prompt rule so a future "let me simplify"
  // refactor doesn't drop the directive that points Cal at the
  // structurally-safe path.

  it("declares the two-path emission constraint", () => {
    // TWO PATHS, BOTH STRUCTURAL — anything else is rejected by
    // the chat-time provenance gate. The framing matters: Cal
    // shouldn't think of spec mode as one of N options, it should
    // think of hand-authoring as not-an-option.
    expect(NORMAL_PROMPT).toMatch(/How to emit a play diagram — TWO PATHS, BOTH STRUCTURAL/);
    expect(NORMAL_PROMPT).toMatch(/structurally rejected/);
    expect(NORMAL_PROMPT).toMatch(/provenance gate/);
  });

  it("names Path A as tool fences with verbatim-drop instruction", () => {
    // Tool fences are still supported; the rule is drop-verbatim.
    // Cal's tendency is to tweak ("just a small depth adjustment")
    // — the explicit "zero edits" phrasing names that failure mode.
    expect(NORMAL_PROMPT).toMatch(/Path A — TOOL FENCES/);
    expect(NORMAL_PROMPT).toMatch(/Drop it VERBATIM/);
    expect(NORMAL_PROMPT).toMatch(/zero edits/);
  });

  it("names Path B as spec emission and frames it as preferred", () => {
    expect(NORMAL_PROMPT).toMatch(/Path B — SPEC EMISSION \(preferred/);
    // The "no coordinates" claim is now SCOPED to catalog routes (the
    // earlier blanket "you never write coordinates" was misleading for
    // bespoke custom routes — see the custom-route test below).
    expect(NORMAL_PROMPT).toMatch(/For catalog routes you never write coordinates/);
    // The pre-rendered example uses Trips Right — pin one assignment
    // so a future "shorten the example" doesn't silently kill it.
    expect(NORMAL_PROMPT).toMatch(/"family": "Slant"/);
    expect(NORMAL_PROMPT).toMatch(/"formation": \{ "name": "Trips Right"/);
  });

  it("names the decision tree (catalog concept vs formation-only vs bespoke route)", () => {
    // Phase 4 follow-up (2026-05-25): the eval suite found Cal calling
    // compose_play({concept: "Spread"}) when the coach asked for a
    // formation-named play with a bespoke route. "Spread" isn't a
    // concept — it's a formation. Decision tree distinguishes the
    // three cases so Cal picks the right tool flow.
    expect(NORMAL_PROMPT).toMatch(/DECISION TREE — which path for a play request/);
    expect(NORMAL_PROMPT).toMatch(/Coach names a CATALOG CONCEPT/);
    expect(NORMAL_PROMPT).toMatch(/Coach names a FORMATION but no catalog concept/);
    expect(NORMAL_PROMPT).toMatch(/Coach asks for a play with an OFF-CATALOG route/);
    expect(NORMAL_PROMPT).toMatch(/NEVER call `compose_play` with a formation name as the concept/);
    // The decision-tree case 2 specifically names the place_offense
    // → ```spec recipe so Cal knows the exact tool flow.
    expect(NORMAL_PROMPT).toMatch(/Call `place_offense\(\{ formation: "<name>" \}\)` to get player positions/);
  });

  it("preserves the bespoke / off-catalog route escape hatch (custom action)", () => {
    // Cal must understand that custom routes ARE supported via the
    // spec path. Without this, the "you never write coordinates"
    // framing would push Cal to either force every coach request
    // into a catalog family (loses fidelity) or hand-author a fence
    // (rejected by Phase 2b). The escape hatch keeps coverage for
    // option routes, exotic combos, screens with specific blocker
    // pulls — anything the catalog doesn't already model.
    expect(NORMAL_PROMPT).toMatch(/Bespoke \/ off-catalog routes are FULLY SUPPORTED via the spec/);
    expect(NORMAL_PROMPT).toMatch(/\{ kind: "custom", description, waypoints \}/);
    expect(NORMAL_PROMPT).toMatch(/Phase 2b's gate doesn't reject custom routes inside specs/);
    // The example covers a real off-catalog case (option route) with
    // an actual waypoint payload so Cal sees what the shape looks like.
    expect(NORMAL_PROMPT).toMatch(/"kind": "custom"/);
    expect(NORMAL_PROMPT).toMatch(/"waypoints": \[\[/);
  });

  it("tells Cal to prefer Option A (spec) from compose_play's result", () => {
    // compose_play now returns both shapes; the prompt must steer
    // Cal toward dropping the spec block. Otherwise the legacy
    // training bias toward emitting raw JSON wins.
    expect(NORMAL_PROMPT).toMatch(/PREFER Option A — the spec block/);
  });

  it("explains the retry behavior when the gate fires", () => {
    // The retry critique routes Cal at spec emission, NOT at
    // "try to repair the fence by hand". The prompt should
    // describe that flow so Cal understands the gate isn't
    // arbitrary — it has a clear escape hatch.
    expect(NORMAL_PROMPT).toMatch(/When the provenance gate fires/);
    expect(NORMAL_PROMPT).toMatch(/emit a ```spec block/);
    expect(NORMAL_PROMPT).toMatch(/stripped from your reply/);
  });

  it("cross-references the new section from rule 7c (SAVE BY DEFAULT)", () => {
    // Rule 7c is the heaviest-trafficked rule for the
    // compose-then-emit flow; it must point at the new
    // emission constraint so Cal doesn't fall back to old
    // verbatim-play-fence guidance.
    expect(NORMAL_PROMPT).toMatch(/Option A.*spec block.*PREFERRED|spec block.*PREFERRED.*Option A/);
    expect(NORMAL_PROMPT).toMatch(/See the "How to emit a play diagram" section/);
  });

  it("cross-references the new section from rule 7g (PlaySpec)", () => {
    // Rule 7g originally framed PlaySpec as a create_play arg.
    // After 2c the same shape is also the chat-emission shape;
    // 7g must point at the new section so Cal doesn't see two
    // disconnected "spec" worlds.
    expect(NORMAL_PROMPT).toMatch(/Same shape used in two places/);
  });
});

describe('NORMAL_PROMPT — "how should defense cover this play" overlay rule (2026-05-24)', () => {
  // Surfaced 2026-05-24 in production: a coach with a Drive play open
  // asked "show me how defense should cover this play now" and Cal
  // composed 7 different offensive concepts (Four Verticals,
  // Curl-Flat, Levels, ...) with custom titles instead of overlaying
  // defenders on the anchored Drive. None of the 7 plays auto-saved
  // cleanly; coach saw "Couldn't auto-save 6 plays" instead of an
  // answer.
  //
  // The fix is a prompt rule that handles the deictic "this play" +
  // anchored offense case — routes the request to compose_defense
  // (with `on_play` set to the anchored play's fence), ONE call, not
  // multiple compose_play calls.

  it("names the trigger phrasings that should route to compose_defense", () => {
    expect(NORMAL_PROMPT).toMatch(/how should defense cover this/i);
    expect(NORMAL_PROMPT).toMatch(/show me the defense for this play|how do defenders adjust|what coverage works here/i);
  });

  it("instructs Cal to call compose_defense ONCE with on_play, not compose_play", () => {
    expect(NORMAL_PROMPT).toMatch(/compose_defense\(\{ on_play: <the anchored play's fence>/);
    expect(NORMAL_PROMPT).toMatch(/ONCE and drop that single fence/);
    expect(NORMAL_PROMPT).toMatch(/DO NOT call `compose_play` to invent new offensive plays/);
  });

  it("names the 2026-05-24 regression so Cal sees the concrete failure mode", () => {
    expect(NORMAL_PROMPT).toMatch(/Surfaced 2026-05-24/);
    expect(NORMAL_PROMPT).toMatch(/7 different offensive concepts/);
    expect(NORMAL_PROMPT).toMatch(/Couldn't auto-save 6 plays/);
  });

  it("clarifies the multi-coverage variant case (separate turns or plan)", () => {
    // The escape hatch: if the coach wants alternative coverages,
    // generate 2-3 SEPARATE compose_defense overlays — each is a
    // coverage variant of the SAME offense, not a new offense.
    expect(NORMAL_PROMPT).toMatch(/alternative coverages.*compose_defense overlays|compose_defense overlays.*same anchored play/);
  });
});

describe("NORMAL_PROMPT — DEFENSE-INSTALL routing rule (2026-05-25)", () => {
  // Surfaced 2026-05-25 production: a coach with an anchored playbook
  // containing two RUN offense plays asked Cal "can you install
  // defenses into this playbook to illustrate this?" Cal called
  // `compose_play` 4 times — producing OFFENSIVE plays titled "3-4 vs
  // Dive Right" / "3-4 vs Sweep Right" that had NO defenders. The
  // coach's intent was unambiguously defensive: install/save verb +
  // plural "defenses" / scheme name. The compose_play tool produces
  // OFFENSE — it's the wrong tool by construction for this request.
  //
  // The fix is a top-level prompt rule that makes the routing
  // EXPLICIT: install + "defenses"/scheme name → compose_defense for
  // EACH existing offense play. The rule has to be at the same
  // visibility level as Rule 322 ("HOW SHOULD DEFENSE COVER THIS
  // PLAY") because the failure mode is identical: Cal sees a verb
  // it associates with compose_play ("install" is a save verb that
  // Cal has been trained to pair with compose_play in N-play install
  // flows) and never reaches the defense branch.

  it("names the trigger verbs (install/save/add/create/build) paired with defensive nouns", () => {
    // The rule must name BOTH halves of the pattern so Cal's
    // pattern-matcher fires regardless of which side it sees first.
    expect(NORMAL_PROMPT).toMatch(/install.*defense|install defenses/i);
    expect(NORMAL_PROMPT).toMatch(/save-intent verbs.*defens|save.*defens|defens.*save/i);
  });

  it("routes the install-defense pattern to compose_defense, not compose_play", () => {
    // Rule must explicitly name BOTH tools so Cal sees which one is
    // wrong and which one is right.
    expect(NORMAL_PROMPT).toMatch(/install.*defenses[\s\S]{0,400}compose_defense/i);
    expect(NORMAL_PROMPT).toMatch(
      /NOT.*compose_play|compose_play.*produces.*offense|compose_play.*is.*the wrong tool/i,
    );
  });

  it("describes the per-offense overlay loop (one compose_defense call per anchored offense)", () => {
    // When the coach has N offense plays open and asks to "install
    // defenses on each", the right pattern is: one compose_defense
    // call per offense play, with `on_play` set to that offense's
    // fence. The prompt must describe this so Cal doesn't fall back
    // to multiple compose_play calls (the production bug).
    expect(NORMAL_PROMPT).toMatch(/compose_defense.*on_play.*each|each.*offense.*compose_defense|one.*compose_defense.*per/i);
  });

  it("names the 2026-05-25 regression with enough detail that Cal sees the failure mode", () => {
    expect(NORMAL_PROMPT).toMatch(/Surfaced 2026-05-25/);
    // Critical regression detail: the titles "3-4 vs Dive Right"
    // suggest Cal had the defensive INTENT but used the wrong tool.
    expect(NORMAL_PROMPT).toMatch(/3-4 vs Dive Right|titled.*3-4 vs|offensive plays.*titled/i);
  });

  it("explains that compose_play creates OFFENSE so coaches see no defenders", () => {
    // The structural reason the bug happens: compose_play's output
    // is the offense-only side of a play. When Cal uses it for a
    // defensive request, the result is OFFENSE with no defenders —
    // which is exactly what the coach won't recognize as "defense".
    expect(NORMAL_PROMPT).toMatch(/compose_play.*produces.*offense|compose_play.*creates.*offense|compose_play.*returns.*offense/i);
  });
});

describe("NORMAL_PROMPT — anchored playbook prohibits list_my_playbooks (2026-05-25)", () => {
  // Surfaced 2026-05-25 production: same exchange as the defense-
  // install bug above. The coach was anchored to "Reddit Drawings"
  // (visible in the chat header) and Cal called `list_my_playbooks`
  // mid-conversation — producing a "Pick a team:" chip prompt the
  // coach had to dismiss. The system prompt's "Anchored playbook"
  // block was right there, but Cal still tool-called the discovery
  // tool. The fix is to make the prohibition LOUD: never call
  // list_my_playbooks when the Anchored playbook block is populated.
  //
  // Note: list_my_playbooks STILL has legitimate uses (lobby mode
  // per Rule 8a, calendar work where Cal needs cross-playbook
  // scope, the explicit "switch to a different playbook" path per
  // Rule 7b). The rule is: don't call it when there's already an
  // active scope.

  it("explicitly prohibits list_my_playbooks when a playbook is anchored", () => {
    expect(NORMAL_PROMPT).toMatch(
      /(NEVER|DO NOT|Do not).*call.*`list_my_playbooks`.*anchored|anchored.*(NEVER|DO NOT|Do not).*list_my_playbooks/,
    );
  });

  it("preserves the legitimate lobby-mode use (Rule 8a) — exception is explicit", () => {
    // The new prohibition rule must not break the lobby-mode rule.
    // The new rule should say "when anchored, don't list" — but
    // when not anchored, the existing flow still applies.
    expect(NORMAL_PROMPT).toMatch(/Call `list_my_playbooks` first/);
  });

  it("names the production regression so Cal sees the concrete failure mode", () => {
    expect(NORMAL_PROMPT).toMatch(/Surfaced 2026-05-25/);
  });

  it("references the tool-handler guard that backs up the prompt rule", () => {
    // The prompt rule has a defense-in-depth backstop: the tool
    // handler refuses with an error when called against an anchored
    // playbook. The prompt should mention this so Cal knows the
    // rule is structural, not advisory.
    expect(NORMAL_PROMPT).toMatch(/handler.*refuse|refuse.*handler|tool.*reject.*anchored|reject.*anchored.*tool/i);
  });
});

describe("NORMAL_PROMPT — defense install offer (Item 3, 2026-05-25)", () => {
  // After Cal installs a defense, it should proactively offer to show
  // that defense against the offensive plays already in the playbook.
  // This is a key differentiating capability — coaches install defense
  // plays so they can teach the response to specific offensive
  // concepts. The full value chain is install → overlay → coach reads
  // → coach teaches the read. Stopping at "install" leaves the coach
  // doing the matchup work manually.

  it("names the offer-to-show pattern after compose_defense", () => {
    expect(NORMAL_PROMPT).toMatch(
      /offer to show.*defense|show.*defense.*against|defense.*vs.*your|defense.*overlay.*existing/i,
    );
  });

  it("references list_plays as the discovery step", () => {
    expect(NORMAL_PROMPT).toMatch(/`list_plays`.*offen|after.*compose_defense[\s\S]{0,400}list_plays/i);
  });

  it("describes the wait-for-yes pattern (don't auto-overlay)", () => {
    expect(NORMAL_PROMPT).toMatch(
      /offer.*wait|ask first.*yes|wait for.*confirm.*overlay|coach says yes[\s\S]{0,200}compose_defense/i,
    );
  });

  it("names the no-offense case (empty playbook)", () => {
    expect(NORMAL_PROMPT).toMatch(
      /no offens|empty playbook|playbook has no.*offen|no plays.*overlay|nothing to overlay/i,
    );
  });

  it("explicitly names this as a Cal differentiator", () => {
    expect(NORMAL_PROMPT).toMatch(
      /differentia|teach.*read|key.*capabilit|coaches install defenses to.*teach/i,
    );
  });
});

// ── #16: Cal over-asks "which play / what context" when one is anchored ──────
//
// Coach feedback (2026-05-28): "it just constantly asks what play or context
// to use, even if i'm clearly talking about the play being shown."
//
// Root cause: when a play is anchored, the context block had ONE one-line
// "Do NOT ask which play" directive immediately followed by a long, emphatic
// CONFIRM block ("CONFIRM before acting — ... — work on this one? ... wait for
// a yes/no ... Never run ... edits ... until the coach confirms"). That block
// is meant ONLY for ambiguous bare numbers ("play 14"), but its narrow scope
// was buried at the very end, and it literally models the over-ask phrasing.
// A cautious model over-generalizes it to every reference (color, label,
// "this play", "make it deeper") and pings the coach instead of acting.
//
// These guard the contextBlock anchored-play directive: explicit "just act"
// language + named forbidden phrasings + the confirm step scoped to bare
// numbers only (mirrors the color-reference rule's "JUST APPLY THE EDIT" fix).
// Content-level only — true behavior needs the eval harness (LLM in the loop).
function anchoredCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    playbookId: "pb-1",
    playbookName: "Eagles",
    sportVariant: "flag_7v7",
    gameLevel: null,
    sanctioningBody: null,
    ageDivision: null,
    playbookSettings: null,
    isAdmin: false,
    canEditPlaybook: true,
    mode: "normal",
    timezone: "America/Chicago",
    playId: "11111111-1111-4111-8111-111111111111",
    playName: "Mesh",
    playFormation: "Trips Right",
    playDiagramText: null,
    playDiagramRecap: null,
    threadId: null,
    userId: null,
    ...overrides,
  };
}

describe("contextBlock — anchored play, no over-asking (#16)", () => {
  it("tells Cal to ACT on the anchored play and never ask which play", () => {
    const block = contextBlock(anchoredCtx());
    // The coach is looking at the play right now; every reference resolves to it.
    expect(block).toMatch(/looking at this play RIGHT NOW/i);
    // Forbidden over-ask phrasings are named so Cal can pattern-match against them.
    expect(block).toMatch(/Forbidden over-asking/i);
    expect(block).toMatch(/Which play do you mean/i);
    expect(block).toMatch(/What's the context/i);
    // Positive default: just act — don't confirm a non-numeric reference.
    expect(block).toMatch(/act immediately, no confirmation/i);
  });

  it("scopes the confirm-before-acting step to BARE NUMBERS only (no bleed)", () => {
    const block = contextBlock(anchoredCtx());
    // The confirm step is called out as the ONE narrow exception for bare numbers.
    expect(block).toMatch(/The ONE exception/i);
    expect(block).toMatch(/bare number/i);
    // Non-numeric references are explicitly exempt from the confirm step.
    expect(block).toMatch(/non-numeric reference[\s\S]*act immediately/i);
    // The legitimate bare-number confirm phrasing is preserved (don't lose it).
    expect(block).toMatch(/work on this one\?/i);
  });

  it("omits the anchored-play directive entirely when no play is anchored", () => {
    const block = contextBlock(anchoredCtx({ playId: null }));
    expect(block).not.toMatch(/looking at this play RIGHT NOW/i);
    expect(block).not.toMatch(/Forbidden over-asking/i);
  });
});
