import { describe, expect, it } from "vitest";
import type { CoachAiTurn } from "@/app/actions/coach-ai";
import {
  activeContextTurns,
  contextDividerTurn,
  contextStartIndex,
  conversationCoversPlay,
  isContextDivider,
  playReferencedInTurns,
} from "./context-boundary";

const user = (text: string, playId?: string | null): CoachAiTurn => ({ role: "user", text, playId });
const asst = (text: string, playId?: string | null): CoachAiTurn => ({
  role: "assistant",
  text,
  toolCalls: [],
  playId,
});

const STICK = "35b45a55-0f23-4bf4-9017-b5e7940ff5f6";
const COUNTER = "99999999-0000-0000-0000-000000000000";

describe("contextStartIndex", () => {
  it("is 0 when there is no divider (whole thread is active)", () => {
    expect(contextStartIndex([user("hi"), asst("hey")])).toBe(0);
  });

  it("points just after the last divider", () => {
    const turns = [user("a"), asst("b"), contextDividerTurn("Earlier"), user("c")];
    expect(contextStartIndex(turns)).toBe(3);
  });

  it("uses the LAST divider when several exist", () => {
    const turns = [
      contextDividerTurn("d1"),
      user("a"),
      contextDividerTurn("d2"),
      user("b"),
    ];
    expect(contextStartIndex(turns)).toBe(3);
  });

  it("collapses everything when the divider is the final turn (fresh slate)", () => {
    const turns = [user("a"), asst("b"), contextDividerTurn("Earlier")];
    expect(contextStartIndex(turns)).toBe(3); // active context is empty
  });
});

describe("activeContextTurns", () => {
  it("returns only post-divider turns, stripping the divider marker", () => {
    const turns = [
      user("old q"),
      asst("old a"),
      contextDividerTurn("Earlier conversation"),
      user("new q"),
      asst("new a"),
    ];
    expect(activeContextTurns(turns)).toEqual([user("new q"), asst("new a")]);
  });

  it("never leaks a divider marker to the agent", () => {
    const turns = [contextDividerTurn("Earlier"), user("q")];
    expect(activeContextTurns(turns).some(isContextDivider)).toBe(false);
  });

  it("returns the whole thread when there is no divider", () => {
    const turns = [user("q"), asst("a")];
    expect(activeContextTurns(turns)).toEqual(turns);
  });
});

describe("playReferencedInTurns (continuity exception)", () => {
  it("detects a play built in this conversation via its play:// link", () => {
    const turns = [user("build a counter"), asst(`Done. _Saved: [Counter](play://${COUNTER})._`)];
    expect(playReferencedInTurns(turns, COUNTER)).toBe(true);
  });

  it("is false for a play the conversation never mentions (stale open)", () => {
    const turns = [user("build a play"), asst(`_Saved: [Stick Right](play://${STICK})._`)];
    expect(playReferencedInTurns(turns, COUNTER)).toBe(false);
  });

  it("is false for a null/undefined play id", () => {
    const turns = [asst(`play://${STICK}`)];
    expect(playReferencedInTurns(turns, null)).toBe(false);
    expect(playReferencedInTurns(turns, undefined)).toBe(false);
  });
});

describe("conversationCoversPlay (discontinuity decision)", () => {
  it("is true when a turn was authored on the play (per-turn playId)", () => {
    const turns = [user("make it deeper", "screen-id"), asst("done", "screen-id")];
    expect(conversationCoversPlay(turns, "screen-id")).toBe(true);
  });

  it("is true when the play is referenced via a play:// link (built here)", () => {
    const turns = [asst(`_Saved: [Counter](play://${COUNTER})._`, "screen-id")];
    expect(conversationCoversPlay(turns, COUNTER)).toBe(true);
  });

  it("is false when the conversation is about a different play (the bug)", () => {
    // Legacy Stick Right turns (no playId stamp), coach opens Screen.
    const turns = [user("add a play"), asst(`_Saved: [Stick Right](play://${STICK})._`)];
    expect(conversationCoversPlay(turns, "screen-id")).toBe(false);
  });

  it("is false for a null play id (lobby)", () => {
    expect(conversationCoversPlay([asst("hi", "x")], null)).toBe(false);
  });
});

describe("scenario: open Screen after a Stick Right session (the bug)", () => {
  it("collapsing the stale prefix leaves an empty active context", () => {
    // Loaded thread is all about Stick Right; coach just opened Screen, which is
    // not referenced anywhere → a divider is appended at the end.
    const loaded: CoachAiTurn[] = [
      user("add a play vs cover 3"),
      asst(`_Saved: [Stick Right](play://${STICK})._`),
    ];
    expect(playReferencedInTurns(loaded, "screen-play-id")).toBe(false); // → discontinuity
    const withDivider = [...loaded, contextDividerTurn("Earlier conversation")];
    expect(activeContextTurns(withDivider)).toEqual([]); // Cal starts fresh on Screen
  });
});

describe("scenario: build a counter then open it (continuity preserved)", () => {
  it("does NOT reset because the new play was created in this conversation", () => {
    const loaded: CoachAiTurn[] = [
      user("build me a counter to this"),
      asst(`Here's your counter. _Saved: [Counter](play://${COUNTER})._`),
    ];
    // Coach navigates to the just-created counter → continuity exception holds.
    expect(playReferencedInTurns(loaded, COUNTER)).toBe(true); // → NOT a discontinuity
    // No divider inserted → full context stays active.
    expect(activeContextTurns(loaded)).toEqual(loaded);
  });
});
