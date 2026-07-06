import { describe, expect, it } from "vitest";
import { computeSoftKeyboardOpen, isEditableElement } from "./useSoftKeyboardOpen";

function make(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe("isEditableElement", () => {
  it("treats textarea and text-like inputs as editable", () => {
    expect(isEditableElement(make("textarea"))).toBe(true);
    expect(isEditableElement(make("input", { type: "text" }))).toBe(true);
    expect(isEditableElement(make("input", { type: "search" }))).toBe(true);
    expect(isEditableElement(make("input", { type: "email" }))).toBe(true);
    // No type attr defaults to text.
    expect(isEditableElement(make("input"))).toBe(true);
  });

  it("treats contenteditable as editable", () => {
    const el = make("div");
    // jsdom doesn't derive isContentEditable from the attribute, so set it.
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isEditableElement(el)).toBe(true);
  });

  it("does not treat button-like inputs or plain elements as editable", () => {
    expect(isEditableElement(make("input", { type: "button" }))).toBe(false);
    expect(isEditableElement(make("input", { type: "checkbox" }))).toBe(false);
    expect(isEditableElement(make("input", { type: "file" }))).toBe(false);
    expect(isEditableElement(make("button"))).toBe(false);
    expect(isEditableElement(make("div"))).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});

describe("computeSoftKeyboardOpen", () => {
  const editable = make("textarea");
  const notEditable = make("button");

  it("is open when an editable is focused and the viewport shrank past the floor", () => {
    // 800 layout vs 500 visual => 300px keyboard.
    expect(
      computeSoftKeyboardOpen({
        activeElement: editable,
        layoutViewportHeight: 800,
        visualViewportHeight: 500,
      }),
    ).toBe(true);
  });

  it("is closed when nothing editable is focused, even if the viewport shrank", () => {
    expect(
      computeSoftKeyboardOpen({
        activeElement: notEditable,
        layoutViewportHeight: 800,
        visualViewportHeight: 500,
      }),
    ).toBe(false);
    expect(
      computeSoftKeyboardOpen({
        activeElement: null,
        layoutViewportHeight: 800,
        visualViewportHeight: 500,
      }),
    ).toBe(false);
  });

  it("is closed for a focused field with no meaningful shrink (hardware keyboard)", () => {
    // 800 vs 780 => 20px, below the 120 floor.
    expect(
      computeSoftKeyboardOpen({
        activeElement: editable,
        layoutViewportHeight: 800,
        visualViewportHeight: 780,
      }),
    ).toBe(false);
  });

  it("falls back to focus alone when no visual-viewport height is available", () => {
    expect(
      computeSoftKeyboardOpen({
        activeElement: editable,
        layoutViewportHeight: 800,
        visualViewportHeight: null,
      }),
    ).toBe(true);
    expect(
      computeSoftKeyboardOpen({
        activeElement: notEditable,
        layoutViewportHeight: 800,
        visualViewportHeight: null,
      }),
    ).toBe(false);
  });
});
