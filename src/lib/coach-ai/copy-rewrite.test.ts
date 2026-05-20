/**
 * Goldens for rewritePlayFencesForCopy — the clipboard-friendly rewrite
 * that replaces raw ```play``` JSON with coach-readable prose.
 *
 * The contract: surrounding markdown is byte-preserved; each fence is
 * swapped for prose (projectSpecToNotes output) or a "Play: <title>"
 * fallback when parsing fails. The whole point is that pasting Cal's
 * response into Facebook produces a coaching writeup, not a JSON dump.
 */

import { describe, expect, it } from "vitest";
import { rewritePlayFencesForCopy } from "./copy-rewrite";

describe("rewritePlayFencesForCopy", () => {
  it("leaves markdown without ```play fences unchanged", () => {
    const md = "Hey coach! Here's a thought on **3rd-and-short**.";
    expect(rewritePlayFencesForCopy(md)).toBe(md);
  });

  it("replaces a valid ```play fence with coach prose (no raw JSON)", () => {
    const diagram = {
      title: "Spread Slant-Flat",
      variant: "flag_7v7",
      players: [
        { id: "C", role: "C", x: 0, y: 0, team: "O" },
        { id: "Q", role: "Q", x: 0, y: -5, team: "O" },
        { id: "X", role: "X", x: -8, y: 0, team: "O" },
        { id: "Z", role: "Z", x: 8, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", points: [{ x: -8, y: 0 }, { x: -3, y: 6 }] },
        { from: "Z", points: [{ x: 8, y: 0 }, { x: 12, y: 4 }] },
      ],
    };
    const md = "Try this:\n\n```play\n" + JSON.stringify(diagram) + "\n```\n\nLet me know.";
    const out = rewritePlayFencesForCopy(md);
    expect(out).not.toMatch(/"players"/);
    expect(out).not.toMatch(/```play/);
    expect(out).toMatch(/Try this:/);
    expect(out).toMatch(/Let me know\.$/);
  });

  it("falls back to a Play: <title> placeholder when JSON is malformed", () => {
    const md = "```play\n{not valid json\n```";
    const out = rewritePlayFencesForCopy(md);
    expect(out).toBe("**Play: Play**");
  });

  it("uses the diagram title in the fallback when parsing succeeds but projection is empty", () => {
    // Diagram with no players — projector returns a one-line fallback;
    // we just confirm no raw JSON leaks through.
    const md = '```play\n{"title":"Empty Play"}\n```';
    const out = rewritePlayFencesForCopy(md);
    expect(out).not.toMatch(/[{}]/);
    expect(out).toMatch(/Empty Play/);
  });

  it("replaces ```play-ref fences with a short Play: <name> placeholder", () => {
    const md = 'See: ```play-ref\n{"id":"abc-123","name":"Trips Right Snag"}\n```';
    const out = rewritePlayFencesForCopy(md);
    expect(out).toBe("See: **Play: Trips Right Snag**");
  });

  it("drops empty play fences silently", () => {
    const md = "Hello\n```play\n\n```\nWorld";
    const out = rewritePlayFencesForCopy(md);
    expect(out).toBe("Hello\n\nWorld");
  });

  it("rewrites multiple fences in one message", () => {
    const a = JSON.stringify({ title: "Slant", players: [], routes: [] });
    const b = JSON.stringify({ title: "Flat", players: [], routes: [] });
    const md = "First:\n```play\n" + a + "\n```\nSecond:\n```play\n" + b + "\n```";
    const out = rewritePlayFencesForCopy(md);
    expect(out).not.toMatch(/```play/);
    expect(out).toMatch(/Slant/);
    expect(out).toMatch(/Flat/);
  });
});
