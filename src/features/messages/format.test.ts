/**
 * Tests for the messages formatting helpers — relative time, grouping,
 * day labels, and avatar color determinism.
 *
 * The helpers are pure (no I/O, no React) so the tests stay fast and the
 * logic stays inspectable. The grouping helper especially is a small piece
 * of code with outsized UX impact (it's what makes consecutive messages
 * read as a continuation block instead of a wall of repeated avatars), so
 * the round-trip cases are pinned here.
 */

import { describe, expect, it } from "vitest";
import {
  avatarColorForUserId,
  formatDayLabel,
  formatRelativeTime,
  initialsFor,
  isSameDay,
  shouldGroupWith,
} from "./format";

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-05-05T12:00:00Z");

  it("renders 'just now' inside a 45-second window", () => {
    const t = new Date(NOW.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(t, NOW)).toBe("just now");
  });

  it("renders minutes for under one hour", () => {
    const t = new Date(NOW.getTime() - 6 * 60_000).toISOString();
    expect(formatRelativeTime(t, NOW)).toBe("6m ago");
  });

  it("renders hours for same-day older messages", () => {
    const t = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(t, NOW)).toBe("3h ago");
  });
});

describe("shouldGroupWith", () => {
  it("does not group when there is no previous message", () => {
    expect(
      shouldGroupWith(null, { authorId: "a", createdAt: "2026-05-05T12:00:00Z" }),
    ).toBe(false);
  });

  it("does not group when authors differ", () => {
    expect(
      shouldGroupWith(
        { authorId: "a", createdAt: "2026-05-05T12:00:00Z" },
        { authorId: "b", createdAt: "2026-05-05T12:01:00Z" },
      ),
    ).toBe(false);
  });

  it("groups same-author messages within five minutes", () => {
    expect(
      shouldGroupWith(
        { authorId: "a", createdAt: "2026-05-05T12:00:00Z" },
        { authorId: "a", createdAt: "2026-05-05T12:04:30Z" },
      ),
    ).toBe(true);
  });

  it("does not group when the gap exceeds five minutes", () => {
    expect(
      shouldGroupWith(
        { authorId: "a", createdAt: "2026-05-05T12:00:00Z" },
        { authorId: "a", createdAt: "2026-05-05T12:06:00Z" },
      ),
    ).toBe(false);
  });
});

describe("isSameDay / formatDayLabel", () => {
  it("isSameDay returns true for two timestamps on the same calendar day", () => {
    expect(
      isSameDay("2026-05-05T08:00:00Z", "2026-05-05T22:00:00Z"),
    ).toBe(true);
  });

  it("formatDayLabel returns 'Today' for today's date", () => {
    const now = new Date();
    expect(formatDayLabel(now.toISOString(), now)).toBe("Today");
  });

  it("formatDayLabel returns 'Yesterday' for one day before now", () => {
    const now = new Date("2026-05-05T18:00:00");
    const yest = new Date("2026-05-04T10:00:00");
    expect(formatDayLabel(yest.toISOString(), now)).toBe("Yesterday");
  });
});

describe("avatarColorForUserId", () => {
  it("is deterministic: same id always returns the same color", () => {
    expect(avatarColorForUserId("user-123")).toBe(avatarColorForUserId("user-123"));
  });

  it("returns a hex color from the palette", () => {
    expect(avatarColorForUserId("anything")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("initialsFor", () => {
  it("returns single-name initials uppercased", () => {
    expect(initialsFor("alex", "u")).toBe("AL");
  });

  it("returns first + last initials for multi-name displayName", () => {
    expect(initialsFor("Coach Smith", "u")).toBe("CS");
  });

  it("falls back to userId chars when displayName is empty", () => {
    expect(initialsFor(null, "abc-def")).toBe("AB");
  });
});
