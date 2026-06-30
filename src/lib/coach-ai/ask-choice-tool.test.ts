import { describe, expect, it } from "vitest";
import { ask_choice, buildChoiceProposal, type ChoiceProposal } from "./ask-choice-tool";

describe("buildChoiceProposal", () => {
  it("builds a proposal with ids assigned per option", () => {
    const res = buildChoiceProposal({
      question: "Which Cover 3 beater?",
      options: [
        { label: "Build the Stick concept", detail: "high-low on the flat defender" },
        { label: "Build the Levels concept" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.question).toBe("Which Cover 3 beater?");
    expect(res.proposal.options).toHaveLength(2);
    expect(res.proposal.options[0].label).toBe("Build the Stick concept");
    expect(res.proposal.options[0].detail).toBe("high-low on the flat defender");
    expect(res.proposal.options[1].detail).toBeUndefined();
    // ids are unique + present
    expect(res.proposal.options[0].id).toBeTruthy();
    expect(res.proposal.options[0].id).not.toBe(res.proposal.options[1].id);
    expect(res.proposal.proposalId).toBeTruthy();
  });

  it("rejects a missing/blank question", () => {
    expect(buildChoiceProposal({ question: "  ", options: [{ label: "a" }, { label: "b" }] })).toEqual({
      ok: false,
      error: "question is required.",
    });
  });

  it("drops blank-label options and rejects when fewer than 2 remain", () => {
    const res = buildChoiceProposal({
      question: "Pick",
      options: [{ label: "only one" }, { label: "  " }, { foo: "bar" }],
    });
    expect(res).toEqual({ ok: false, error: "Provide at least 2 options with non-empty labels." });
  });

  it("rejects more than 5 options", () => {
    const res = buildChoiceProposal({
      question: "Pick",
      options: Array.from({ length: 6 }, (_, i) => ({ label: `opt ${i}` })),
    });
    expect(res).toEqual({ ok: false, error: "Provide at most 5 options." });
  });

  it("handles non-array options input", () => {
    expect(buildChoiceProposal({ question: "Pick", options: "nope" }).ok).toBe(false);
  });
});

describe("ask_choice handler", () => {
  it("returns a result carrying a parseable choice-proposal fence", async () => {
    const r = await ask_choice.handler(
      {
        question: "Which coverage should I overlay?",
        options: [{ label: "Overlay Cover 1 Man" }, { label: "Overlay Cover 2" }, { label: "Overlay Cover 3" }],
      },
      // ctx is unused by this tool
      {} as never,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = /```choice-proposal\n([\s\S]*?)\n```/.exec(r.result);
    expect(m).toBeTruthy();
    const parsed = JSON.parse(m![1]) as ChoiceProposal;
    expect(parsed.options.map((o) => o.label)).toEqual([
      "Overlay Cover 1 Man",
      "Overlay Cover 2",
      "Overlay Cover 3",
    ]);
  });

  it("errors (ok:false) on an invalid request rather than emitting a chip", async () => {
    const r = await ask_choice.handler({ question: "x", options: [{ label: "only" }] }, {} as never);
    expect(r.ok).toBe(false);
  });
});
