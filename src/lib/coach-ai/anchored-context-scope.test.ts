import { describe, expect, it } from "vitest";
import {
  computeAnchoredContextStart,
  isOffTopicForAnchor,
  normalizePlayName,
  type ScopeTurn,
} from "./anchored-context-scope";

const CURL = "ab89d530-20b7-4688-8a71-9297fa1a20b4";
const BUBBLE = "11111111-1111-1111-1111-111111111111";

const fence = (title: string) =>
  "```play\n" + JSON.stringify({ title, variant: "flag_5v5", players: [], routes: [] }) + "\n```";

describe("normalizePlayName", () => {
  it("lowercases and collapses punctuation", () => {
    expect(normalizePlayName("Curl-Flat Right")).toBe("curl flat right");
    expect(normalizePlayName("  Bubble  Right! ")).toBe("bubble right");
    expect(normalizePlayName(null)).toBe("");
  });
});

describe("isOffTopicForAnchor", () => {
  const norm = normalizePlayName("Curl-Flat Right");

  it("flags a turn stamped with a different play id", () => {
    expect(isOffTopicForAnchor({ role: "assistant", text: "hi", playId: BUBBLE }, CURL, norm)).toBe(true);
  });

  it("does NOT flag a turn stamped with the anchored play", () => {
    expect(isOffTopicForAnchor({ role: "assistant", text: "hi", playId: CURL }, CURL, norm)).toBe(false);
  });

  it("flags a legacy (null-playId) turn showing a DIFFERENT play's fence", () => {
    const turn: ScopeTurn = { role: "assistant", text: `here you go\n${fence("Bubble Right")}`, playId: null };
    expect(isOffTopicForAnchor(turn, CURL, norm)).toBe(true);
  });

  it("does NOT flag a fence naming the anchored play (incl. an overlay title)", () => {
    expect(isOffTopicForAnchor({ role: "assistant", text: fence("Curl-Flat Right"), playId: null }, CURL, norm)).toBe(false);
    expect(isOffTopicForAnchor({ role: "assistant", text: fence("Curl-Flat Right vs Cover 2"), playId: null }, CURL, norm)).toBe(false);
  });

  it("treats fence-less prose / Q&A as neutral (not off-topic)", () => {
    expect(isOffTopicForAnchor({ role: "user", text: "what beats cover 2?", playId: null }, CURL, norm)).toBe(false);
    expect(isOffTopicForAnchor({ role: "assistant", text: "Attack the seams.", playId: null }, CURL, norm)).toBe(false);
  });

  it("a play:// link in prose does NOT make a turn off-topic (only fences pin topic)", () => {
    // This is the exact hole that fooled the client divider: a passing mention.
    const turn: ScopeTurn = { role: "assistant", text: `notes added: [Curl-Flat Right](play://${CURL})`, playId: null };
    expect(isOffTopicForAnchor(turn, CURL, norm)).toBe(false);
  });
});

describe("computeAnchoredContextStart", () => {
  it("returns 0 when no play is anchored", () => {
    const history: ScopeTurn[] = [{ role: "user", text: "hi", playId: null }];
    expect(computeAnchoredContextStart({ history, anchoredPlayId: null, anchoredPlayName: null })).toBe(0);
  });

  it("PROD REPRO (2026-07-04): stale Bubble Right convo, anchored to Curl-Flat Right", () => {
    // Faithful to the DB dump: month-old legacy (null-playId) turns building a
    // red-zone package, ending with "show me bubble right" -> a Bubble fence.
    const history: ScopeTurn[] = [
      { role: "user", text: "add all 5 of these plays", playId: null },
      { role: "assistant", text: `Here's your package.\n${fence("Bubble Right")}\n${fence("Curl-Flat Right")}`, playId: null },
      { role: "user", text: "add detailed notes", playId: null },
      { role: "assistant", text: `notes: [Curl-Flat Right](play://${CURL}) [Bubble Right](play://${BUBBLE})`, playId: null },
      { role: "user", text: "show me bubble right", playId: null },
      { role: "assistant", text: `${fence("Bubble Right")}`, playId: null },
    ];
    // Anchored to Curl-Flat Right, new question about "this play".
    const start = computeAnchoredContextStart({ history, anchoredPlayId: CURL, anchoredPlayName: "Curl-Flat Right" });
    // The last off-topic turn is the final "Bubble Right" fence (index 5) ->
    // boundary is end-of-history: the model sees NONE of the stale convo.
    expect(start).toBe(6);
    expect(history.slice(start)).toEqual([]);
  });

  it("keeps an on-anchor recent tail (drops only the stale prefix)", () => {
    const history: ScopeTurn[] = [
      { role: "assistant", text: fence("Bubble Right"), playId: null }, // off-topic
      { role: "user", text: "now open curl-flat", playId: CURL },
      { role: "assistant", text: fence("Curl-Flat Right"), playId: CURL }, // on-topic
    ];
    const start = computeAnchoredContextStart({ history, anchoredPlayId: CURL, anchoredPlayName: "Curl-Flat Right" });
    expect(start).toBe(1); // just after the Bubble turn
  });

  it("build-a-counter continuity: keeps the conversation that produced the anchored play", () => {
    // Coach builds a counter, navigates to it; anchored to the new counter.
    const COUNTER = "22222222-2222-2222-2222-222222222222";
    const history: ScopeTurn[] = [
      { role: "user", text: "build me a counter", playId: null },
      { role: "assistant", text: `Here's your counter.\n${fence("Counter Trey")}`, playId: null },
    ];
    const start = computeAnchoredContextStart({ history, anchoredPlayId: COUNTER, anchoredPlayName: "Counter Trey" });
    expect(start).toBe(0); // nothing off-topic -> full context retained
  });

  it("actively editing the anchored play retains everything", () => {
    const history: ScopeTurn[] = [
      { role: "user", text: "make the slant deeper", playId: CURL },
      { role: "assistant", text: fence("Curl-Flat Right"), playId: CURL },
      { role: "user", text: "add a corner route", playId: CURL },
    ];
    expect(
      computeAnchoredContextStart({ history, anchoredPlayId: CURL, anchoredPlayName: "Curl-Flat Right" }),
    ).toBe(0);
  });
});
