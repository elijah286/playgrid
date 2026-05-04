/**
 * Pure-function tests for the format-toolbar helpers. The toolbar
 * itself is wired in PlayerMentionEditor; these helpers operate on the
 * value string + selection range so they're easy to test without a DOM.
 */

import { describe, it, expect } from "vitest";
import { applyWrap, applyLinePrefix } from "./PlayerMentionEditor";

describe("applyWrap (bold/italic toolbar)", () => {
  it("wraps a selected slice with the marker", () => {
    const r = applyWrap("hello world", { start: 6, end: 11 }, "**", "text");
    expect(r.newValue).toBe("hello **world**");
    // selection lands on the original text inside the wrap so the user
    // can keep typing or unbold by tapping again.
    expect(r.newValue.slice(r.selStart, r.selEnd)).toBe("world");
  });

  it("inserts a placeholder at a collapsed caret with no selection", () => {
    const r = applyWrap("", { start: 0, end: 0 }, "**", "text");
    expect(r.newValue).toBe("**text**");
    expect(r.newValue.slice(r.selStart, r.selEnd)).toBe("text");
  });

  it("toggles off when the selection is already inside an existing wrap", () => {
    // selection covers just "world" but the markers wrap it
    const r = applyWrap("hello **world**", { start: 8, end: 13 }, "**", "text");
    expect(r.newValue).toBe("hello world");
    expect(r.newValue.slice(r.selStart, r.selEnd)).toBe("world");
  });

  it("toggles off when the selection itself is the wrapper-text-wrapper", () => {
    // double-clicking a bold word can pick up the markers too
    const r = applyWrap("hello **world**", { start: 6, end: 15 }, "**", "text");
    expect(r.newValue).toBe("hello world");
    expect(r.newValue.slice(r.selStart, r.selEnd)).toBe("world");
  });

  it("italic uses single asterisks and a different placeholder", () => {
    const r = applyWrap("note: ", { start: 6, end: 6 }, "*", "italic");
    expect(r.newValue).toBe("note: *italic*");
  });
});

describe("applyLinePrefix (bullet/heading toolbar)", () => {
  it("prefixes a single line that the caret sits on", () => {
    const r = applyLinePrefix("first\nsecond\nthird", { start: 8, end: 8 }, "- ");
    expect(r.newValue).toBe("first\n- second\nthird");
  });

  it("prefixes every line touched by a multi-line selection", () => {
    const r = applyLinePrefix("a\nb\nc", { start: 0, end: 5 }, "- ");
    expect(r.newValue).toBe("- a\n- b\n- c");
  });

  it("toggles bullets off when every line already has the prefix", () => {
    const r = applyLinePrefix("- a\n- b\n- c", { start: 0, end: 11 }, "- ");
    expect(r.newValue).toBe("a\nb\nc");
  });

  it("supports heading prefix (## ) the same way", () => {
    const r = applyLinePrefix("Big idea", { start: 0, end: 0 }, "## ");
    expect(r.newValue).toBe("## Big idea");
  });

  it("preserves empty lines in a bulleted block (no '- ' on the empty line)", () => {
    // Empty lines aren't bulleted — keeps tight spacing in the rendered
    // markdown. The toggle check ignores them too.
    const r = applyLinePrefix("a\n\nb", { start: 0, end: 4 }, "- ");
    expect(r.newValue).toBe("- a\n\n- b");
  });
});
