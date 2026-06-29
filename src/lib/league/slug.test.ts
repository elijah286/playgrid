import { describe, it, expect } from "vitest";

import { normalizeLeagueSlug } from "./slug";

describe("normalizeLeagueSlug", () => {
  it("clears the slug for empty / whitespace input", () => {
    expect(normalizeLeagueSlug("")).toEqual({ ok: true, slug: null });
    expect(normalizeLeagueSlug("   ")).toEqual({ ok: true, slug: null });
  });

  it("lowercases and trims valid slugs", () => {
    expect(normalizeLeagueSlug("  Waco-Spring-2027 ")).toEqual({
      ok: true,
      slug: "waco-spring-2027",
    });
    expect(normalizeLeagueSlug("a")).toEqual({ ok: true, slug: "a" });
    expect(normalizeLeagueSlug("u12")).toEqual({ ok: true, slug: "u12" });
  });

  it("rejects spaces, leading/trailing hyphens, and punctuation", () => {
    expect(normalizeLeagueSlug("waco spring").ok).toBe(false);
    expect(normalizeLeagueSlug("-waco").ok).toBe(false);
    expect(normalizeLeagueSlug("waco-").ok).toBe(false);
    expect(normalizeLeagueSlug("waco!").ok).toBe(false);
    expect(normalizeLeagueSlug("café").ok).toBe(false);
  });

  it("rejects slugs longer than 50 chars", () => {
    expect(normalizeLeagueSlug("a".repeat(50)).ok).toBe(true);
    expect(normalizeLeagueSlug("a".repeat(51)).ok).toBe(false);
  });
});
