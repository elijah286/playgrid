import { describe, expect, it } from "vitest";
import {
  containsObjectionableText,
  objectionableNameError,
} from "./objectionable-text";

describe("containsObjectionableText", () => {
  it("flags hard slurs", () => {
    for (const s of ["nigger", "faggot", "Kike", "a chink", "you spic"]) {
      expect(containsObjectionableText(s), s).toBe(true);
    }
  });

  it("flags explicit sexual terms and hard profanity", () => {
    for (const s of ["cunt", "rapist", "porn star", "fuck you", "what a bitch", "asshole"]) {
      expect(containsObjectionableText(s), s).toBe(true);
    }
  });

  it("catches leetspeak substitutions", () => {
    for (const s of ["f4ggot", "n1gger", "sh1t", "b!tch"]) {
      expect(containsObjectionableText(s), s).toBe(true);
    }
  });

  it("catches repeated-letter padding", () => {
    expect(containsObjectionableText("fuuuuck")).toBe(true);
    expect(containsObjectionableText("shiiit")).toBe(true);
  });

  it("catches separator evasion on the worst slurs", () => {
    for (const s of ["n.i.g.g.e.r", "f a g g o t", "n-i-g-g-a"]) {
      expect(containsObjectionableText(s), s).toBe(true);
    }
  });

  it("does NOT flag clean names — including Scunthorpe cases", () => {
    for (const s of [
      "Coach Smith",
      "Scunthorpe United",
      "class of 2026",
      "bass player",
      "the pass rush",
      "assassin",
      "Dick Butkus",
      "Randall Cox",
      "Hancock",
      "Cockburn",
      "Van Dyke", // intentionally allowed (surname) — see wordlist note
      "Coon Rapids", // intentionally allowed (place/surname)
      "shiitake",
      "",
      "   ",
    ]) {
      expect(containsObjectionableText(s), s).toBe(false);
    }
  });

  it("handles null/undefined", () => {
    expect(containsObjectionableText(null)).toBe(false);
    expect(containsObjectionableText(undefined)).toBe(false);
  });
});

describe("objectionableNameError", () => {
  it("returns a friendly message for objectionable input, null otherwise", () => {
    expect(objectionableNameError("Coach Cal")).toBeNull();
    expect(objectionableNameError("faggot")).toMatch(/language we don't allow/i);
  });
});
