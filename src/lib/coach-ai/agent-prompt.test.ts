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

  it("walks through the 6-step waypoint workflow in order", () => {
    const step1 = NORMAL_PROMPT.indexOf("Step 1 — Enumerate plays");
    const step2 = NORMAL_PROMPT.indexOf("Step 2 — CALIBRATE SCALE");
    const step3 = NORMAL_PROMPT.indexOf("Step 3 — ANCHORED OBSERVATION PASS");
    const step4 = NORMAL_PROMPT.indexOf("Step 4 — Translate the observation list into the JSON fence");
    const step5 = NORMAL_PROMPT.indexOf("Step 5 — Emit the hand-authored play fence");
    const step6 = NORMAL_PROMPT.indexOf("Step 6 — Move to the next play");
    expect(step1).toBeGreaterThan(-1);
    expect(step2).toBeGreaterThan(step1);
    expect(step3).toBeGreaterThan(step2);
    expect(step4).toBeGreaterThan(step3);
    expect(step5).toBeGreaterThan(step4);
    expect(step6).toBeGreaterThan(step5);
  });

  it("Step 3 requires anchored observation (player + route lists) before JSON encoding", () => {
    // The fix for the hallucination failure mode (Cal making up
    // "play-shaped output" that doesn't match the drawing). Forcing
    // explicit anchored observations against image landmarks gives
    // the vision model a chance to verify what it actually sees
    // before committing to waypoints.
    expect(NORMAL_PROMPT).toMatch(/ANCHORED OBSERVATION PASS/);
    expect(NORMAL_PROMPT).toMatch(/3a — Player anchor list/);
    expect(NORMAL_PROMPT).toMatch(/3b — Route observation list/);
    expect(NORMAL_PROMPT).toMatch(/3c — Cross-check with the play label/);
    expect(NORMAL_PROMPT).toMatch(/3d — Hallucination guard/);
  });

  it("Step 3b requires per-route Direction + Distance + Endpoint observations", () => {
    // The three things Cal must verbalize per route. Without all
    // three, the encoding step has nothing to ground against.
    expect(NORMAL_PROMPT).toMatch(/Direction \(FIRST move\)/);
    expect(NORMAL_PROMPT).toMatch(/Distance \/ depth/);
    expect(NORMAL_PROMPT).toMatch(/Endpoint \/ breaks/);
  });

  it("Step 4 ties prose accuracy to waypoint accuracy explicitly", () => {
    // The encoding step must MATCH the observation prose. If prose
    // says "short curl" and waypoints encode a deep out, the
    // encoding is wrong — not a free-form re-interpretation.
    expect(NORMAL_PROMPT).toMatch(/route prose AND the waypoints MUST match/);
    expect(NORMAL_PROMPT).toMatch(/The fence is a mechanical encoding of the observation list/);
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
    // is bypassed when an image is attached. Cal anchors each
    // player to image landmarks in Step 3a, then converts to (x, y)
    // in Step 4 — without going through place_offense.
    expect(NORMAL_PROMPT).toMatch(/Player anchor list/);
    expect(NORMAL_PROMPT).toMatch(/DO NOT CALL THESE TOOLS ON IMAGE TURNS/);
    expect(NORMAL_PROMPT).toMatch(/`compose_play`, `place_offense`/);
  });

  it("describes route waypoints with explicit JSON shape (from + path + curve, no family)", () => {
    // Cal needs to know exactly which fields to emit. The hand-
    // authored fence uses pure custom_path routes — no family, no
    // route_kind. Without these guardrails Cal reverts to its
    // default route schema with family/depth.
    expect(NORMAL_PROMPT).toMatch(/from: "<id>", path: \[\[x1, y1\], \[x2, y2\], \.\.\.\], curve: <bool>/);
    expect(NORMAL_PROMPT).toMatch(/No `family`, no `route_kind`/);
  });

  it("includes waypoint patterns for non-vertical routes (lateral encoding)", () => {
    // Surfaced 2026-05-21 round 4: Cal's prose said "Y breaks inside
    // at 8 yards (dig)" but emitted path: [[6, 8]] — a vertical, no
    // inside-break waypoint. The rendered play looked nothing like
    // the drawing because every route collapsed to a vertical. The
    // fix: explicit examples for in / dig / out / corner / post /
    // drag / flat / curl / comeback that show the lateral waypoint.
    expect(NORMAL_PROMPT).toMatch(/paths encode BOTH lateral \(x\) and depth \(y\) movement/i);
    // Spot-check the most failure-prone routes get concrete examples.
    expect(NORMAL_PROMPT).toMatch(/Drag[\s\S]*?\[\[12, 3\]\]/);     // lateral across the field
    expect(NORMAL_PROMPT).toMatch(/Flat[\s\S]*?\[\[-15, 2\]\]/);    // lateral to sideline
    expect(NORMAL_PROMPT).toMatch(/Dig[\s\S]*?\[\[-12, 10\], \[-3, 10\]\]/);  // vertical then in
    expect(NORMAL_PROMPT).toMatch(/Corner[\s\S]*?\[\[12, 10\], \[18, 16\]\]/); // vertical then out-up
    expect(NORMAL_PROMPT).toMatch(/Post[\s\S]*?\[\[12, 10\], \[4, 16\]\]/);    // vertical then in-up
  });

  it("includes a mirror rule for left-vs-right starting positions", () => {
    // Players on the left run inside-breaks toward POSITIVE x;
    // players on the right toward NEGATIVE x. The mirror rule
    // prevents Cal from emitting a left-side dig that breaks the
    // wrong direction.
    expect(NORMAL_PROMPT).toMatch(/Mirror rule/);
    expect(NORMAL_PROMPT).toMatch(/positive x → break has NEGATIVE x change/);
  });

  it("includes a self-check that prevents lateral-component collapse", () => {
    // The post-emit self-check Cal runs before emitting: "does this
    // path have a meaningful x change for any non-vertical route?"
    // Catches the prose-says-dig-but-fence-shows-vertical failure
    // mode.
    expect(NORMAL_PROMPT).toMatch(/Self-check before emitting/);
    expect(NORMAL_PROMPT).toMatch(/lateral component.*does my path have a waypoint where x changes/i);
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

  it("forbids narrating the waypoint workflow to the coach", () => {
    // Surfaced 2026-05-21 round 5: Cal opened a reply with "This is
    // an image-upload turn — I'm in waypoint mode. Let me restart
    // cleanly." plus "Scale check from the photo:" — pure internal
    // mechanics leaking to the user. Coaches don't need to hear
    // about the state machine. The prompt now forbids this kind of
    // narration explicitly.
    expect(NORMAL_PROMPT).toMatch(/NEVER NARRATE THE WORKFLOW TO THE COACH/);
    // Spot-check the worst offenders are named.
    expect(NORMAL_PROMPT).toMatch(/I'm in waypoint mode/);
    expect(NORMAL_PROMPT).toMatch(/no catalog matching/);
    expect(NORMAL_PROMPT).toMatch(/Scale check from the photo/);
  });

  it("requires a route entry for every non-QB player (parity rule)", () => {
    // Surfaced 2026-05-21 round 5: Cal emitted a 7v7 fence with 7
    // players (Q, C, X, H, Z, S, B) but only 4 route entries (X, Z,
    // S, B) — missing @H and @C. The 7v7 save-time validator
    // rejected. Cal's previous rule "stationary players = no route
    // entry" conflicted with the universal "every non-QB needs an
    // action" gate. New rule requires stub routes for stationary
    // non-QB players.
    expect(NORMAL_PROMPT).toMatch(/EVERY non-QB offensive player in your `players\[\]` array MUST have a corresponding entry in `routes\[\]`/);
    expect(NORMAL_PROMPT).toMatch(/Roster ↔ routes parity is a HARD gate/);
    // The stub-path recipe must be concrete so Cal can copy it.
    expect(NORMAL_PROMPT).toMatch(/path: \[\[<start_x>, 1\]\]/);
  });

  it("documents the QB-only exception to the parity rule", () => {
    // The one player who legitimately has no route in flag variants
    // is the QB. The prompt must call this out so Cal doesn't try
    // to stub-route the QB and trip the FLAG QB validator.
    expect(NORMAL_PROMPT).toMatch(/For @QB only.*omit @QB from `routes\[\]` entirely/);
  });
});
