/**
 * Auto-commit helpers — `rosterCountForVariant`, `extractPlayFencesFromText`,
 * `fenceIsFullRosterPlay`.
 *
 * These pin the save-by-default decision boundary. Surfaced 2026-05-20: a
 * trialing coach in an 11v11 Tackle playbook walked through Cal's 5-play
 * install one play per turn and saw nothing land in the playbook until they
 * explicitly typed "save them all" at the end. The new behavior auto-commits
 * full-roster fences the moment Cal emits them; demos (rule 9a — single
 * route, single defender) stay exploratory.
 *
 * The bar these tests pin:
 *   - Full-roster fences SAVE (11-player tackle play, 7-player flag play).
 *   - Single-element demos SKIP (QB + receiver = 2 players, never a play).
 *   - Variant matters: 7 players in flag_7v7 = play; 7 players in tackle_11 =
 *     incomplete (skipped).
 *   - Defense-only fences with the full defender count SAVE (a "Cover 2"
 *     diagram is a defense play, not a demo).
 *   - The fence extractor handles multiple fences in one assistant reply.
 */

import { describe, expect, it } from "vitest";
import {
  rosterCountForVariant,
  extractPlayFencesFromText,
  fenceIsFullRosterPlay,
  collectAllHistoryFences,
  extractPlayIdFromCreateResult,
  formatAutoSaveReason,
  extractLastUserText,
  shouldEmitLobbyOrphanWarning,
  shouldSkipFenceInCreateAutoCommit,
  SAVE_INTENT_DEFENSE_RE,
} from "./agent";
import type { ChatMessage } from "./llm";

describe("rosterCountForVariant", () => {
  it("returns 11 for tackle_11", () => {
    expect(rosterCountForVariant("tackle_11")).toBe(11);
  });

  it("returns 7 for flag_7v7", () => {
    expect(rosterCountForVariant("flag_7v7")).toBe(7);
  });

  it("returns 6 for flag_6v6", () => {
    expect(rosterCountForVariant("flag_6v6")).toBe(6);
  });

  it("returns 5 for flag_5v5", () => {
    expect(rosterCountForVariant("flag_5v5")).toBe(5);
  });

  it("returns conservative 5 for unknown / other / null", () => {
    expect(rosterCountForVariant("other")).toBe(5);
    expect(rosterCountForVariant(null)).toBe(5);
    expect(rosterCountForVariant(undefined)).toBe(5);
    expect(rosterCountForVariant("bogus_variant")).toBe(5);
  });
});

describe("extractPlayFencesFromText", () => {
  it("returns the JSON body of a single ```play fence", () => {
    const text = 'Here is Inside Zone:\n\n```play\n{"players":[]}\n```\n\nReady for play 2?';
    expect(extractPlayFencesFromText(text)).toEqual(['{"players":[]}']);
  });

  it("returns all fences when multiple are present", () => {
    const text =
      '```play\n{"id":"p1"}\n```\nSome text.\n```play\n{"id":"p2"}\n```\nMore text.\n```play\n{"id":"p3"}\n```';
    expect(extractPlayFencesFromText(text)).toEqual([
      '{"id":"p1"}',
      '{"id":"p2"}',
      '{"id":"p3"}',
    ]);
  });

  it("returns empty array when no fence is present", () => {
    expect(extractPlayFencesFromText("Just prose, no diagrams.")).toEqual([]);
    expect(extractPlayFencesFromText("")).toEqual([]);
  });

  it("ignores non-play code fences", () => {
    const text = '```ts\nconst x = 1;\n```\n```json\n{}\n```';
    expect(extractPlayFencesFromText(text)).toEqual([]);
  });
});

describe("fenceIsFullRosterPlay", () => {
  it("returns true for an 11-offense tackle_11 play (Inside Zone shape)", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "B", team: "O" },
        { id: "LT", team: "O" }, { id: "LG", team: "O" }, { id: "C", team: "O" },
        { id: "RG", team: "O" }, { id: "RT", team: "O" },
        { id: "X", team: "O" }, { id: "Z", team: "O" },
        { id: "H", team: "O" }, { id: "S", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(true);
  });

  it("returns true for a 7-offense flag_7v7 play", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" }, { id: "B", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" },
        { id: "Z", team: "O" }, { id: "H", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(true);
  });

  it("returns true for a 5-offense flag_5v5 play", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" }, { id: "Z", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_5v5")).toBe(true);
  });

  it("returns false for a single-route demo (QB + receiver, 2 players)", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" },
        { id: "X", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(false);
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(false);
    expect(fenceIsFullRosterPlay(fence, "flag_5v5")).toBe(false);
  });

  it("returns false for a single-defender demo (QB + receiver + defender)", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" },
        { id: "X", team: "O" },
        { id: "CB", team: "D" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(false);
  });

  it("variant matters: 7 offensive players is a play in flag_7v7 but NOT in tackle_11", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" }, { id: "B", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" },
        { id: "Z", team: "O" }, { id: "H", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(true);
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(false);
  });

  it("returns true for a defense-only Cover 2 in flag_7v7 (7 defenders, no offense)", () => {
    const fence = {
      players: [
        { id: "LB1", team: "D" }, { id: "LB2", team: "D" },
        { id: "CB1", team: "D" }, { id: "CB2", team: "D" },
        { id: "S1", team: "D" }, { id: "S2", team: "D" },
        { id: "NB", team: "D" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "flag_7v7")).toBe(true);
  });

  it("returns true for a full-offense + full-defense matchup (rule 8a)", () => {
    const players: Array<{ id: string; team: string }> = [];
    for (let i = 0; i < 11; i++) players.push({ id: `O${i}`, team: "O" });
    for (let i = 0; i < 11; i++) players.push({ id: `D${i}`, team: "D" });
    expect(fenceIsFullRosterPlay({ players }, "tackle_11")).toBe(true);
  });

  it("returns false for an empty fence", () => {
    expect(fenceIsFullRosterPlay({ players: [] }, "tackle_11")).toBe(false);
    expect(fenceIsFullRosterPlay({}, "tackle_11")).toBe(false);
  });

  it("falls back to total player count when team field is absent (legacy fences)", () => {
    const fence = {
      players: [
        { id: "QB" }, { id: "B" },
        { id: "LT" }, { id: "LG" }, { id: "C" },
        { id: "RG" }, { id: "RT" },
        { id: "X" }, { id: "Z" }, { id: "H" }, { id: "S" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "tackle_11")).toBe(true);
  });

  it("handles unknown variants with the conservative 5-player floor", () => {
    const fence = {
      players: [
        { id: "QB", team: "O" }, { id: "C", team: "O" },
        { id: "X", team: "O" }, { id: "Y", team: "O" }, { id: "Z", team: "O" },
      ],
    };
    expect(fenceIsFullRosterPlay(fence, "other")).toBe(true);
    expect(fenceIsFullRosterPlay(fence, null)).toBe(true);
  });
});

describe("collectAllHistoryFences", () => {
  function assistant(text: string): ChatMessage {
    return { role: "assistant", content: [{ type: "text", text }] };
  }
  function user(text: string): ChatMessage {
    return { role: "user", content: text };
  }

  it("returns empty array on empty history", () => {
    expect(collectAllHistoryFences([])).toEqual([]);
  });

  it("returns empty array when no assistant turn has a fence", () => {
    const history: ChatMessage[] = [
      user("Hello"),
      assistant("Hi, how can I help?"),
      user("What is a slant?"),
      assistant("A slant is a quick inside-breaking route."),
    ];
    expect(collectAllHistoryFences(history)).toEqual([]);
  });

  it("collects fences from a single assistant turn", () => {
    const history: ChatMessage[] = [
      user("show me Inside Zone"),
      assistant('Here it is.\n\n```play\n{"id":"iz"}\n```\n\nReady to keep going?'),
    ];
    expect(collectAllHistoryFences(history)).toEqual(['{"id":"iz"}']);
  });

  it("collects fences from multiple assistant turns in oldest-first order", () => {
    const history: ChatMessage[] = [
      user("play 1"),
      assistant('```play\n{"n":"Inside Zone"}\n```'),
      user("yes ready for play 2"),
      assistant('```play\n{"n":"Sweep"}\n```'),
      user("yes ready for play 3"),
      assistant('```play\n{"n":"Counter"}\n```'),
    ];
    expect(collectAllHistoryFences(history)).toEqual([
      '{"n":"Inside Zone"}',
      '{"n":"Sweep"}',
      '{"n":"Counter"}',
    ]);
  });

  it("collects multiple fences from a single turn (batch proposal pattern)", () => {
    const history: ChatMessage[] = [
      user("give me 3 plays"),
      assistant(
        'Here are 3:\n\n```play\n{"n":"p1"}\n```\n\n```play\n{"n":"p2"}\n```\n\n```play\n{"n":"p3"}\n```',
      ),
    ];
    expect(collectAllHistoryFences(history)).toEqual([
      '{"n":"p1"}',
      '{"n":"p2"}',
      '{"n":"p3"}',
    ]);
  });

  it("walks ALL history (not just the most-recent fence-bearing turn)", () => {
    // The exact pattern from the 6-play regression: 6 prior turns each
    // with one fence. Older walk implementations would only return the
    // last turn's fence; this walk returns all 6.
    const history: ChatMessage[] = [];
    for (let i = 1; i <= 6; i++) {
      history.push(user(`play ${i}`));
      history.push(assistant(`\`\`\`play\n{"n":"p${i}"}\n\`\`\``));
    }
    history.push(user("yes save them"));
    const fences = collectAllHistoryFences(history);
    expect(fences).toHaveLength(6);
    expect(fences[0]).toBe('{"n":"p1"}');
    expect(fences[5]).toBe('{"n":"p6"}');
  });

  it("ignores user messages even when they contain ```play fences", () => {
    const history: ChatMessage[] = [
      user('```play\n{"copy":"pasted"}\n```'),
      assistant("Got it."),
    ];
    expect(collectAllHistoryFences(history)).toEqual([]);
  });
});

describe("extractPlayIdFromCreateResult", () => {
  it("extracts a UUID from /plays/<uuid>/edit", () => {
    const result =
      'Created play "Inside Zone" in the current playbook. ' +
      "Tell the coach it's ready and link them: " +
      "[Open Inside Zone](/plays/12345678-1234-1234-1234-123456789012/edit).";
    expect(extractPlayIdFromCreateResult(result)).toBe(
      "12345678-1234-1234-1234-123456789012",
    );
  });

  it("returns null when no UUID is present", () => {
    expect(extractPlayIdFromCreateResult("Created play but the link failed.")).toBe(null);
    expect(extractPlayIdFromCreateResult("")).toBe(null);
  });

  it("matches case-insensitively (uppercase hex chars in UUID)", () => {
    const result = "Saved: /plays/ABCDEF12-3456-7890-ABCD-EF1234567890/edit";
    expect(extractPlayIdFromCreateResult(result)).toBe(
      "ABCDEF12-3456-7890-ABCD-EF1234567890",
    );
  });

  it("rejects partial UUIDs and other paths", () => {
    expect(extractPlayIdFromCreateResult("/plays/abc/edit")).toBe(null);
    expect(extractPlayIdFromCreateResult("/playbooks/12345678-1234-1234-1234-123456789012/edit")).toBe(null);
  });
});

describe("formatAutoSaveReason — strip the validator preamble, keep the actionable bullets", () => {
  // Surfaced 2026-05-20: a coach got "Couldn't auto-save 3 plays — Fix the
  // route_kind to match the" with no follow-through because the chat
  // suffix truncated each play's reason at 200 chars, cutting right after
  // the verbose preamble. The helper drops the preamble and surfaces the
  // per-route bullets directly.

  it("strips the route-assignment validator preamble and returns the bullets", () => {
    const raw =
      `Route-assignment validation failed for 1 route(s) — diagram NOT saved. ` +
      `Each declared route_kind must agree with the path's depth and side per the catalog's constraints. ` +
      `Fix the route_kind to match the geometry, or fix the path to match the route_kind, then re-emit.\n` +
      `  • @X (declared "Go"): route_kind="Go" must finish vertically (within 1.5 yds of the player's x), but the path ends 4.2 yds laterally.`;
    const formatted = formatAutoSaveReason(raw);
    expect(formatted).toContain("@X");
    expect(formatted).toContain("must finish vertically");
    expect(formatted).not.toContain("validation failed for 1 route(s)");
    expect(formatted).not.toContain("diagram NOT saved");
  });

  it("strips the play-content validator preamble too (same shape)", () => {
    const raw =
      `Play content validation failed for 1 issue(s) — diagram NOT saved. Fix each issue and re-emit:\n` +
      `  • color clash — @H, @A all render yellow (#FACC15). The auto-renderer derives token colors from role+label...`;
    const formatted = formatAutoSaveReason(raw);
    expect(formatted).toContain("color clash");
    expect(formatted).not.toContain("Play content validation failed");
    expect(formatted).not.toContain("Fix each issue and re-emit");
  });

  it("preserves multi-line bullet detail (multiple routes failing in one play)", () => {
    const raw =
      `Route-assignment validation failed for 2 route(s) — diagram NOT saved. Each declared route_kind must agree with the path's depth and side per the catalog's constraints. Fix the route_kind to match the geometry, or fix the path to match the route_kind, then re-emit.\n` +
      `  • @X (declared "Go"): route_kind="Go" must finish vertically...\n` +
      `  • @Z (declared "Go"): route_kind="Go" must finish vertically...`;
    const formatted = formatAutoSaveReason(raw);
    expect(formatted).toContain("@X");
    expect(formatted).toContain("@Z");
  });

  it("returns plain non-bullet errors unchanged (capability gate, parse failure)", () => {
    const raw =
      `"Flea Flicker" needs capabilities this playbook hasn't enabled: handoff_chain.`;
    const formatted = formatAutoSaveReason(raw);
    expect(formatted).toBe(raw);
  });

  it("guards against empty input", () => {
    expect(formatAutoSaveReason("")).toBe("(no reason given)");
  });
});

describe("extractLastUserText — pulls text from the most recent user message", () => {
  function userString(text: string): ChatMessage {
    return { role: "user", content: text };
  }
  function userBlocks(...blocks: Array<{ type: "text"; text: string }>): ChatMessage {
    return { role: "user", content: blocks };
  }
  function assistant(text: string): ChatMessage {
    return { role: "assistant", content: [{ type: "text", text }] };
  }

  it("returns string content from a plain user message", () => {
    expect(extractLastUserText([userString("install Tampa 2")])).toBe("install Tampa 2");
  });

  it("returns concatenated text from block-content user messages", () => {
    expect(
      extractLastUserText([
        userBlocks({ type: "text", text: "install" }, { type: "text", text: "Tampa 2" }),
      ]),
    ).toBe("install\nTampa 2");
  });

  it("walks backward and returns the LATEST user message", () => {
    const history: ChatMessage[] = [
      userString("first ask"),
      assistant("here you go"),
      userString("second ask — install Tampa 2"),
    ];
    expect(extractLastUserText(history)).toBe("second ask — install Tampa 2");
  });

  it("skips assistant turns to find the prior user message", () => {
    const history: ChatMessage[] = [
      userString("install Tampa 2"),
      assistant("done"),
      assistant("(synth message)"),
    ];
    expect(extractLastUserText(history)).toBe("install Tampa 2");
  });

  it("returns empty string when no user message exists", () => {
    expect(extractLastUserText([])).toBe("");
    expect(extractLastUserText([assistant("solo assistant")])).toBe("");
  });
});

describe("SAVE_INTENT_DEFENSE_RE — pins the defense auto-commit decision boundary", () => {
  // Surfaced 2026-05-21: coach said "now install a defense... Tampa two read"
  // anchored to Smash Right. Cal called compose_defense + update_play_notes;
  // claimed "saved" but no defense play landed in the playbook because
  // (a) compose_defense doesn't persist, (b) update_play_notes touched the
  // OFFENSE play, and (c) the existing create-auto-commit skips when
  // ctx.playId is set. The new defense-auto-commit branch fires on save-
  // intent verbs in the prompting user message. This regex IS the gate.

  it("matches the original-bug phrasing ('install a defense')", () => {
    expect(SAVE_INTENT_DEFENSE_RE.test("now install a defense — Tampa 2 read")).toBe(true);
  });

  it("matches common save verbs across phrasings", () => {
    const positives = [
      "install Tampa 2",
      "save this defense",
      "add a Cover 3 to this play",
      "create a Tampa 2 here",
      "build me a Cover 2 vs Smash",
      "make a blitz package for this",
      "keep this defense",
      "set up a 4-3 Cover 3",
      "put in a Tampa 2 read",
      "lock in Cover 1",
      "wire up a 7v7 zone here",
      "stick a Cover 3 on this play",
    ];
    for (const text of positives) {
      expect(SAVE_INTENT_DEFENSE_RE.test(text), `should match: ${text}`).toBe(true);
    }
  });

  it("does NOT match exploration phrasing — preserves the 'show me' / 'how does X' UX", () => {
    const negatives = [
      "show me Tampa 2",
      "show me a Tampa two read defense",  // exact phrasing from 2026-05-21 round 2 bug
      "how does Cover 3 play this",
      "what does a 4-3 look like",
      "walk me through Tampa 2",
      "what about a blitz here",
      "explain Cover 3",
      "describe how Tampa 2 defends Smash",
      "I'm curious about Cover 1",
      "compare Tampa 2 vs Cover 3 here",
      "tell me about the Mike's read",
    ];
    for (const text of negatives) {
      expect(SAVE_INTENT_DEFENSE_RE.test(text), `should NOT match: ${text}`).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(SAVE_INTENT_DEFENSE_RE.test("INSTALL TAMPA 2")).toBe(true);
    expect(SAVE_INTENT_DEFENSE_RE.test("Save This Defense")).toBe(true);
  });
});

describe("shouldEmitLobbyOrphanWarning — pins the play-page anchor bug fix", () => {
  // Surfaced 2026-05-21: coach was viewing "7v7 Zone Tampa 2" in the editor
  // and asked "now show how the defenders should shift to cover this Smash
  // Right play". Cal emitted a defense-only fence (exploration, no save
  // verb). The create-auto-commit skipped (ctx.playId set), the defense-
  // overlay branch skipped (no save-intent), and the else fell through to
  // the "Coach Cal isn't anchored to a playbook right now" warning — even
  // though the chat header still read "Anchored to 14u 7v7 Spring 2026 ·
  // 7v7 Zone Tampa 2". The warning must ONLY fire in TRUE lobby mode (no
  // playbookId at all).

  it("fires in true lobby mode (no playbookId, has orphan, Cal didn't save)", () => {
    expect(
      shouldEmitLobbyOrphanWarning({
        playbookId: null,
        calCalledCreatePlay: false,
        hasOrphanedFences: true,
      }),
    ).toBe(true);
  });

  it("stays silent on play-page mode (playbookId set) — the 2026-05-21 bug case", () => {
    expect(
      shouldEmitLobbyOrphanWarning({
        playbookId: "pb-uuid-123",
        calCalledCreatePlay: false,
        hasOrphanedFences: true,
      }),
    ).toBe(false);
  });

  it("stays silent when Cal called create_play explicitly (Cal handled the save)", () => {
    expect(
      shouldEmitLobbyOrphanWarning({
        playbookId: null,
        calCalledCreatePlay: true,
        hasOrphanedFences: true,
      }),
    ).toBe(false);
  });

  it("stays silent when there are no orphaned fences to warn about", () => {
    expect(
      shouldEmitLobbyOrphanWarning({
        playbookId: null,
        calCalledCreatePlay: false,
        hasOrphanedFences: false,
      }),
    ).toBe(false);
  });

  it("treats undefined playbookId the same as null (true lobby)", () => {
    expect(
      shouldEmitLobbyOrphanWarning({
        playbookId: undefined,
        calCalledCreatePlay: false,
        hasOrphanedFences: true,
      }),
    ).toBe(true);
  });
});

describe("shouldSkipFenceInCreateAutoCommit — pins the play-page defense-save recovery", () => {
  // Surfaced 2026-05-21: coach was viewing "7v7 Zone Tampa 2" in the
  // editor and typed "install tampa two". Cal violated the prompt rule
  // ("call compose_defense WITH on_play OR propose_save_defense_play")
  // by emitting a defense-only fence + hallucinating a save claim. The
  // create-auto-commit was skipped (ctx.playId set), the overlay branch
  // was skipped (no offense in fence), and the coach saw a phantom
  // success. The recovery: let defense-only fences with save-intent
  // break through the play-page guard so create_play saves them as
  // standalone defense plays.

  it("skips defense-only fences without save-intent (exploration: 'show me Tampa 2')", () => {
    expect(
      shouldSkipFenceInCreateAutoCommit({
        onPlayPage: false,
        fenceIsDefenseOnly: true,
        hasDefenseSaveIntent: false,
      }),
    ).toBe(true);
  });

  it("saves defense-only fences with save-intent on a play page (the 2026-05-21 bug case)", () => {
    expect(
      shouldSkipFenceInCreateAutoCommit({
        onPlayPage: true,
        fenceIsDefenseOnly: true,
        hasDefenseSaveIntent: true,
      }),
    ).toBe(false);
  });

  it("saves defense-only fences with save-intent OFF a play page (existing flow)", () => {
    expect(
      shouldSkipFenceInCreateAutoCommit({
        onPlayPage: false,
        fenceIsDefenseOnly: true,
        hasDefenseSaveIntent: true,
      }),
    ).toBe(false);
  });

  it("skips offense fences on a play page (handled by Auto-commit guard / update_play)", () => {
    expect(
      shouldSkipFenceInCreateAutoCommit({
        onPlayPage: true,
        fenceIsDefenseOnly: false,
        hasDefenseSaveIntent: false,
      }),
    ).toBe(true);
  });

  it("skips offense fences on a play page EVEN WITH save-intent (the prompt-rule-skip stays — would double-create with update_play)", () => {
    expect(
      shouldSkipFenceInCreateAutoCommit({
        onPlayPage: true,
        fenceIsDefenseOnly: false,
        hasDefenseSaveIntent: true,
      }),
    ).toBe(true);
  });

  it("saves offense fences off a play page (the lobby + playbook-overview flow)", () => {
    expect(
      shouldSkipFenceInCreateAutoCommit({
        onPlayPage: false,
        fenceIsDefenseOnly: false,
        hasDefenseSaveIntent: false,
      }),
    ).toBe(false);
  });
});
