/**
 * `userWantsSave` — confirmation/save-intent detector for the create
 * auto-commit branch in agent.ts.
 *
 * Surfaced 2026-05-10 (bhbfearless trial transcript). Cal kept emitting
 * play fences and the coach kept saying "yes," but Cal never called
 * `create_play` so the Lions playbook ended the session with zero
 * plays. The fix: a save-intent detector that, at end-of-turn,
 * triggers auto-commit when the coach's message means "save what we
 * were just looking at."
 *
 * The detector is two regexes ORed together:
 *   - PURE_CONFIRMATION_RE: the WHOLE message is a confirmation
 *     ("yes", "sounds good", "perfect")
 *   - EXPLICIT_SAVE_RE: anywhere in the message, an explicit save
 *     verb pointed at the current play(s)
 *
 * False negatives are recoverable (coach says save again). False
 * positives create unwanted plays. So the bar these tests pin is:
 * NEVER false-positive on rejection / qualified responses, and DO
 * fire on the natural confirmations the trial transcripts showed.
 */

import { describe, expect, it } from "vitest";
import {
  PURE_CONFIRMATION_RE,
  EXPLICIT_SAVE_RE,
  userWantsSave,
} from "./agent";

describe("PURE_CONFIRMATION_RE — whole-message matches", () => {
  it.each([
    ["yes", true],
    ["Yes", true],
    ["YES", true],
    ["yes.", true],
    ["Yes!", true],
    ["yeah", true],
    ["Yep", true],
    ["yup", true],
    ["y", true],
    ["ok", true],
    ["okay", true],
    ["OK", true],
    ["sure", true],
    ["sounds good", true],
    ["Sounds good.", true],
    ["sound good", true],
    ["looks good", true],
    ["looks good!", true],
    ["do it", true],
    ["let's go", true],
    ["lets go", true],
    ["let's do it", true],
    ["go for it", true],
    ["good", true],
    ["great", true],
    ["Perfect", true],
    ["fine", true],
    ["👍", true],
    ["✓", true],
  ])("matches the bare confirmation %j", (text, expected) => {
    expect(PURE_CONFIRMATION_RE.test(text)).toBe(expected);
  });

  it.each([
    // Qualified "yes" — should NOT match (the regex anchors end-of-string)
    ["yes that was unimaginative"],
    ["yes but make it longer"],
    ["yes, can you also add motion"],
    ["yes if it's not too complicated"],
    // Outright rejections
    ["no"],
    ["nope"],
    ["that's wrong"],
    ["change @X to a slant"],
    // Questions
    ["what about the slot?"],
    ["can you add motion"],
    // Empty-ish
    [""],
    [" "],
    // Looks like a confirmation but isn't
    ["good question"],
    ["great idea but"],
  ])("does NOT match a qualified / rejecting message %j", (text) => {
    expect(PURE_CONFIRMATION_RE.test(text.trim())).toBe(false);
  });
});

describe("EXPLICIT_SAVE_RE — save-verb anywhere in message", () => {
  it.each([
    "save it",
    "save them",
    "save these",
    "save all",
    "save them all",
    "Save these plays to my playbook",
    "save all plays to play book",
    "save the play",
    "go ahead and save these",
    "Yeah, save it then",
  ])("matches %j", (text) => {
    expect(EXPLICIT_SAVE_RE.test(text)).toBe(true);
  });

  it.each([
    "save me from this defense",
    "I'll save the explanation for later",
    "saved my season",
    "let me think about it",
  ])("does NOT match incidental 'save' usage %j", (text) => {
    expect(EXPLICIT_SAVE_RE.test(text)).toBe(false);
  });
});

describe("userWantsSave — combined detector (the real interface)", () => {
  it("fires on bare confirmations", () => {
    expect(userWantsSave("yes")).toBe(true);
    expect(userWantsSave("Sounds good!")).toBe(true);
  });

  it("fires on explicit save commands", () => {
    expect(userWantsSave("Save all plays to play book")).toBe(true);
    expect(userWantsSave("save these as Cal 1 and Cal 2")).toBe(true);
  });

  it("does NOT fire on qualified yeses (the maltagliatis case)", () => {
    expect(userWantsSave("yes that was unimaginative")).toBe(false);
    expect(userWantsSave("You can't put two players in motion, that's basic football")).toBe(false);
  });

  it("does NOT fire on rejection or correction", () => {
    expect(userWantsSave("That play won't work against the team that runs this defense")).toBe(false);
    expect(userWantsSave("no, make it deeper")).toBe(false);
    expect(userWantsSave("change @X to a corner")).toBe(false);
  });

  it("does NOT fire on questions", () => {
    expect(userWantsSave("Can you add motion to this play?")).toBe(false);
    expect(userWantsSave("what does @Q do here?")).toBe(false);
  });

  it("does NOT fire on empty / whitespace", () => {
    expect(userWantsSave("")).toBe(false);
    expect(userWantsSave("   ")).toBe(false);
    expect(userWantsSave("\n\n")).toBe(false);
  });
});

describe("userWantsSave — replay of the actual bhbfearless transcript", () => {
  // These are the exact user messages from the 5/9 + 5/10 thread that
  // SHOULD trigger save (per the fix's intent). The auto-commit will
  // run for each at end-of-turn and persist the prior assistant fence.
  const SHOULD_SAVE = [
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "Sounds good",
    "Save all plays to play book",
    "Yes",
    "20 yards",       // qualified — should NOT fire (false-negative is fine)
    "Yes",
    "Yes",
  ];
  // Of those, "20 yards" is a non-confirmation reply to a clarifying
  // question — auto-commit shouldn't fire. Everything else should.
  it("fires on every plain 'Yes' and 'Sounds good' / 'Save all plays...'", () => {
    expect(userWantsSave("Yes")).toBe(true);
    expect(userWantsSave("Sounds good")).toBe(true);
    expect(userWantsSave("Save all plays to play book")).toBe(true);
  });
  it("does NOT fire on '20 yards' (a numeric answer to a clarifying Q)", () => {
    expect(userWantsSave("20 yards")).toBe(false);
  });

  // Verify the overall pattern: of the 12 messages, 11 are save-intent.
  it("classifies the transcript correctly", () => {
    const results = SHOULD_SAVE.map(userWantsSave);
    const saveCount = results.filter(Boolean).length;
    expect(saveCount).toBe(11);
  });
});
