/**
 * Tests for the defensive-intent classifier (intent-classify.ts).
 *
 * The canonical bug (2026-05-25 production): a coach said "can you
 * install defenses into this playbook to illustrate this?" and Cal
 * called `compose_play` 4 times — producing offensive plays missing
 * defenders. The classifier exists to catch this lexically before
 * Cal picks a tool.
 *
 * Categories covered:
 *  - install-defense (save verb + defensive noun/scheme)
 *  - overlay-defense (scheme + "this play" deictic)
 *  - explain-defense (show verb + defensive noun/scheme)
 *  - none (offensive prompts, ambiguous text, empty input,
 *          bare "defense" without context)
 */

import { describe, expect, it } from "vitest";
import {
  classifyDefenseIntent,
  isInstallDefenseIntent,
} from "./intent-classify";

describe("classifyDefenseIntent — install-defense (the canonical bug)", () => {
  it('matches "install defenses into this playbook" (the production message)', () => {
    const r = classifyDefenseIntent(
      "can you install defenses into this playbook to illustrate this?",
    );
    expect(r.kind).toBe("install-defense");
    if (r.kind !== "install-defense") return;
    expect(r.matchedVerb.toLowerCase()).toContain("install");
    expect(r.matchedNoun.toLowerCase()).toContain("defense");
  });

  it('matches "add the 3-4 to all my plays"', () => {
    const r = classifyDefenseIntent("add the 3-4 to all my plays");
    expect(r.kind).toBe("install-defense");
    if (r.kind !== "install-defense") return;
    expect(r.scheme).toMatch(/3-4/i);
  });

  it('matches "save Tampa 2 to this playbook"', () => {
    const r = classifyDefenseIntent("save Tampa 2 to this playbook");
    expect(r.kind).toBe("install-defense");
    if (r.kind !== "install-defense") return;
    expect(r.scheme).toMatch(/tampa\s*2/i);
  });

  it('matches "install Cover 3 against each of these plays"', () => {
    const r = classifyDefenseIntent("install Cover 3 against each of these plays");
    expect(r.kind).toBe("install-defense");
    if (r.kind !== "install-defense") return;
    expect(r.scheme).toMatch(/cover\s*3/i);
  });

  it('matches "build me a blitz package"', () => {
    const r = classifyDefenseIntent("build me a blitz package");
    expect(r.kind).toBe("install-defense");
  });

  it('matches "create a Cover 1 defense for the Drive play"', () => {
    const r = classifyDefenseIntent("create a Cover 1 defense for the Drive play");
    expect(r.kind).toBe("install-defense");
  });

  it('matches "put in a 4-3 zone for each play"', () => {
    const r = classifyDefenseIntent("put in a 4-3 zone for each play");
    expect(r.kind).toBe("install-defense");
  });

  it("isInstallDefenseIntent shortcut returns true for the canonical case", () => {
    expect(
      isInstallDefenseIntent(
        "can you install defenses into this playbook to illustrate this?",
      ),
    ).toBe(true);
  });
});

describe("classifyDefenseIntent — overlay-defense (scheme + play reference)", () => {
  it('matches "show this play vs Cover 1"', () => {
    const r = classifyDefenseIntent("show this play vs Cover 1");
    expect(r.kind === "overlay-defense" || r.kind === "explain-defense").toBe(true);
    // Either is acceptable — both route to compose_defense. We
    // assert the SCHEME got picked up, which is what matters.
    if (r.kind === "overlay-defense" || r.kind === "explain-defense") {
      expect(r.scheme).toMatch(/cover\s*1/i);
    }
  });

  it('matches "how does Tampa 2 cover this play"', () => {
    const r = classifyDefenseIntent("how does Tampa 2 cover this play");
    // "how does" matches SHOW_VERBS, so this could be explain or overlay.
    // Both route to compose_defense; assert it's defensive.
    expect(r.kind).not.toBe("none");
    if (r.kind !== "none") {
      expect(r.scheme).toMatch(/tampa\s*2/i);
    }
  });
});

describe("classifyDefenseIntent — explain-defense (no save)", () => {
  it('matches "show me a Tampa 2"', () => {
    const r = classifyDefenseIntent("show me a Tampa 2");
    expect(r.kind).toBe("explain-defense");
    if (r.kind !== "explain-defense") return;
    expect(r.scheme).toMatch(/tampa\s*2/i);
  });

  it('matches "draw a 4-3 Cover 3"', () => {
    const r = classifyDefenseIntent("draw a 4-3 Cover 3");
    expect(r.kind).toBe("explain-defense");
  });

  it('matches "walk me through Cover 6"', () => {
    const r = classifyDefenseIntent("walk me through Cover 6");
    expect(r.kind).toBe("explain-defense");
  });
});

describe("classifyDefenseIntent — none (offensive / ambiguous / empty)", () => {
  it("returns none for offensive prompts", () => {
    expect(classifyDefenseIntent("make me a Mesh play").kind).toBe("none");
    expect(classifyDefenseIntent("install a 6-play package").kind).toBe("none");
    expect(classifyDefenseIntent("show me a slant").kind).toBe("none");
    expect(classifyDefenseIntent("draw Spread Doubles").kind).toBe("none");
  });

  it("returns none for empty/whitespace input", () => {
    expect(classifyDefenseIntent("").kind).toBe("none");
    expect(classifyDefenseIntent("   ").kind).toBe("none");
  });

  it("returns none for metadiscussion that mentions defense without context", () => {
    // Bare "defense" without a save/show verb or scheme — too weak.
    // This is the false-positive case we explicitly want to avoid.
    expect(classifyDefenseIntent("our defense has been struggling").kind).toBe("none");
    expect(classifyDefenseIntent("defense wins championships").kind).toBe("none");
  });

  it("returns none for scheduling/calendar prompts", () => {
    expect(
      classifyDefenseIntent("schedule practice on Tuesday at 6pm").kind,
    ).toBe("none");
  });

  it('returns none for "install" referring to OFFENSIVE plays', () => {
    // "install these 6 plays" — save verb but no defensive noun.
    expect(classifyDefenseIntent("install these 6 plays").kind).toBe("none");
    expect(classifyDefenseIntent("save Mesh to my playbook").kind).toBe("none");
    expect(classifyDefenseIntent("add Snag to the install").kind).toBe("none");
  });
});

describe("classifyDefenseIntent — robustness", () => {
  it("handles surrounding whitespace and punctuation", () => {
    expect(
      classifyDefenseIntent("   install defenses into this playbook!   ").kind,
    ).toBe("install-defense");
  });

  it("is case-insensitive", () => {
    expect(classifyDefenseIntent("INSTALL DEFENSES").kind).toBe("install-defense");
    expect(classifyDefenseIntent("Install Tampa 2").kind).toBe("install-defense");
  });

  it("handles 'defensive scheme/play/call' variations", () => {
    expect(
      classifyDefenseIntent("install a defensive scheme for these plays").kind,
    ).toBe("install-defense");
    expect(
      classifyDefenseIntent("add a defensive call to this play").kind,
    ).toBe("install-defense");
  });
});
