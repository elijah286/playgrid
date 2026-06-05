/**
 * Group-qualified play-id resolution.
 *
 * Cal references plays by the orange UI badge (e.g. "Recommended #5"). The
 * UI restarts numbering inside each group, so the resolver has to:
 *   - parse group-qualified slots ("Recommended #5", "Goal Line/2", "Ungrouped 3")
 *   - match exact UUIDs and play names as before
 *   - reject bare slot numbers when multiple groups have a #N (with
 *     a candidate list so Cal can ask the coach which group)
 *   - return a single match when exactly one group has a #N at that index
 *
 * The pure `resolvePlayIdFromOrdered` lets us test all of this without
 * mocking Supabase.
 */

import { describe, expect, it } from "vitest";
import {
  _buildOrderedPlaybookForTest,
  clampSpecDepthsToFamilyMin,
  resolvePlayIdFromOrdered,
} from "./play-tools";
import type { PlaySpec } from "@/domain/play/spec";

describe("clampSpecDepthsToFamilyMin — raise below-floor route depths so the play saves", () => {
  // Reported 2026-06-04: Cal authored specs with route depths below the
  // family floor (e.g. a Seam at 8yd when Seams run 10–25) and the
  // save-time route-assignment validator hard-rejected — "can't save".
  // resolveDiagramAndSpec now snaps below-floor depths UP to the floor
  // before render/validate so the play saves. Too-DEEP is intentionally
  // left alone (validator reject + suggest-alternative).
  function specWith(assignments: Array<{ player: string; action: Record<string, unknown> }>): PlaySpec {
    return { title: "T", variant: "flag_7v7", formation: { name: "Doubles" }, assignments } as unknown as PlaySpec;
  }

  it("raises a Seam @8 up to the family floor of 10 and reports it", () => {
    const spec = specWith([
      { player: "Z", action: { kind: "route", family: "Seam", depthYds: 8 } },
    ]);
    const summaries = clampSpecDepthsToFamilyMin(spec);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain("8");
    expect(summaries[0]).toContain("10");
    expect((spec.assignments[0].action as { depthYds: number }).depthYds).toBe(10);
  });

  it("leaves an explicit below-floor depth alone when nonCanonical is set", () => {
    const spec = specWith([
      { player: "Z", action: { kind: "route", family: "Seam", depthYds: 8, nonCanonical: true } },
    ]);
    const summaries = clampSpecDepthsToFamilyMin(spec);
    expect(summaries).toHaveLength(0);
    expect((spec.assignments[0].action as { depthYds: number }).depthYds).toBe(8);
  });

  it("leaves a too-DEEP route alone (shallow-only) — Drag @30 stays 30 for the validator to reject", () => {
    const spec = specWith([
      { player: "H", action: { kind: "route", family: "Drag", depthYds: 30 } },
    ]);
    const summaries = clampSpecDepthsToFamilyMin(spec);
    expect(summaries).toHaveLength(0);
    expect((spec.assignments[0].action as { depthYds: number }).depthYds).toBe(30);
  });

  it("is a no-op when every route is at or above its family floor", () => {
    const spec = specWith([
      { player: "X", action: { kind: "route", family: "Curl", depthYds: 5 } },
      { player: "B", action: { kind: "route", family: "Flat", depthYds: 2 } },
    ]);
    const before = JSON.stringify(spec);
    const summaries = clampSpecDepthsToFamilyMin(spec);
    expect(summaries).toHaveLength(0);
    expect(JSON.stringify(spec)).toBe(before);
  });

  it("leaves non-route actions and unknown families alone", () => {
    const spec = specWith([
      { player: "C", action: { kind: "block" } },
      { player: "B", action: { kind: "carry", runType: "inside_zone" } },
      { player: "Z", action: { kind: "route", family: "Nonsense", depthYds: 1 } },
    ]);
    const summaries = clampSpecDepthsToFamilyMin(spec);
    expect(summaries).toHaveLength(0);
  });
});

const groups = [
  { id: "g-rec", name: "Recommended", sort_order: 0 },
  { id: "g-goal", name: "Goal Line", sort_order: 1 },
];

// Mirrors a typical playbook the user described in the screenshot:
// one ungrouped play, then "Recommended" with 8 plays, then "Goal Line" with 2.
const plays = [
  { id: "p-un-1", name: "Stray", sort_order: 0, group_id: null },
  { id: "p-rec-1", name: "Vertigo", sort_order: 0, group_id: "g-rec" },
  { id: "p-rec-2", name: "Stack Left Levels", sort_order: 1, group_id: "g-rec" },
  { id: "p-rec-3", name: "Noah", sort_order: 2, group_id: "g-rec" },
  { id: "p-rec-4", name: "Skiddadle", sort_order: 3, group_id: "g-rec" },
  { id: "p-rec-5", name: "Trips Left Reverse", sort_order: 4, group_id: "g-rec" },
  { id: "p-rec-6", name: "Trips Right Flood", sort_order: 5, group_id: "g-rec" },
  { id: "p-rec-7", name: "Pro Left Wheel", sort_order: 6, group_id: "g-rec" },
  { id: "p-rec-8", name: "Quads Right Switch", sort_order: 7, group_id: "g-rec" },
  { id: "p-goal-1", name: "Iso", sort_order: 0, group_id: "g-goal" },
  { id: "p-goal-2", name: "Sneak", sort_order: 1, group_id: "g-goal" },
];

const ordered = _buildOrderedPlaybookForTest({ plays, groups });

describe("resolvePlayIdFromOrdered — group-qualified slots", () => {
  it("resolves Recommended #5 to the 5th play in the Recommended group", () => {
    const r = resolvePlayIdFromOrdered("Recommended #5", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
  });

  it("resolves Goal Line #2 (multi-word group name)", () => {
    const r = resolvePlayIdFromOrdered("Goal Line #2", ordered);
    expect(r).toEqual({ ok: true, id: "p-goal-2", name: "Sneak" });
  });

  it("resolves slash separator: Recommended/3", () => {
    const r = resolvePlayIdFromOrdered("Recommended/3", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-3", name: "Noah" });
  });

  it("resolves no-separator-no-hash: Recommended 3", () => {
    const r = resolvePlayIdFromOrdered("Recommended 3", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-3", name: "Noah" });
  });

  it("resolves Recommended Play 3 (with the word 'Play')", () => {
    const r = resolvePlayIdFromOrdered("Recommended Play 3", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-3", name: "Noah" });
  });

  it("is case-insensitive on the group name", () => {
    const r = resolvePlayIdFromOrdered("recommended #5", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
  });

  it("resolves Ungrouped #1", () => {
    const r = resolvePlayIdFromOrdered("Ungrouped #1", ordered);
    expect(r).toEqual({ ok: true, id: "p-un-1", name: "Stray" });
  });

  it("rejects a slot that's out of range for the named group", () => {
    const r = resolvePlayIdFromOrdered("Goal Line #5", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/out of range for "Goal Line"/);
  });
});

describe("resolvePlayIdFromOrdered — bare slot disambiguation", () => {
  it("returns the unique match when only one section has a #5", () => {
    // Only Recommended has 8 plays; Goal Line has 2; Ungrouped has 1.
    // So #5 is unambiguous.
    const r = resolvePlayIdFromOrdered("5", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
  });

  it("returns the unique match for 'Play 5' (synonym)", () => {
    const r = resolvePlayIdFromOrdered("Play 5", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
  });

  it("returns the unique match for '#5' (synonym)", () => {
    const r = resolvePlayIdFromOrdered("#5", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
  });

  it("rejects a bare slot when multiple groups have a #1", () => {
    // Ungrouped #1, Recommended #1, and Goal Line #1 all exist.
    const r = resolvePlayIdFromOrdered("1", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/ambiguous/);
      expect(r.error).toMatch(/Recommended #1/);
      expect(r.error).toMatch(/Goal Line #1/);
      expect(r.error).toMatch(/Ungrouped #1/);
    }
  });

  it("rejects 'Play 1' when multiple groups have a #1", () => {
    const r = resolvePlayIdFromOrdered("Play 1", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ambiguous/);
  });

  it("rejects a bare slot that no section has", () => {
    const r = resolvePlayIdFromOrdered("99", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No section has a play at slot 99/);
  });
});

describe("resolvePlayIdFromOrdered — UUID and name", () => {
  it("resolves a real-looking UUID", () => {
    const ord2 = _buildOrderedPlaybookForTest({
      plays: [
        { id: "11111111-1111-1111-1111-111111111111", name: "Real UUID Play", sort_order: 0, group_id: null },
      ],
      groups: [],
    });
    const r = resolvePlayIdFromOrdered("11111111-1111-1111-1111-111111111111", ord2);
    expect(r).toEqual({ ok: true, id: "11111111-1111-1111-1111-111111111111", name: "Real UUID Play" });
  });

  it("returns an error for a UUID not in the playbook", () => {
    const r = resolvePlayIdFromOrdered("11111111-1111-1111-1111-111111111111", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No play with id/);
  });

  it("resolves an exact play name (case-insensitive)", () => {
    const r = resolvePlayIdFromOrdered("trips right flood", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-6", name: "Trips Right Flood" });
  });

  it("resolves a fuzzy substring match if exactly one play matches", () => {
    const r = resolvePlayIdFromOrdered("Sneak", ordered);
    expect(r).toEqual({ ok: true, id: "p-goal-2", name: "Sneak" });
  });

  it("rejects ambiguous fuzzy matches with group-qualified candidates", () => {
    const r = resolvePlayIdFromOrdered("Trips", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/matched multiple plays/);
      expect(r.error).toMatch(/Recommended #5/);
      expect(r.error).toMatch(/Recommended #6/);
    }
  });

  it("returns a clear error when nothing matches", () => {
    const r = resolvePlayIdFromOrdered("zzzzzzzz", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No play matched/);
  });
});

describe("resolvePlayIdFromOrdered — edge cases", () => {
  it("rejects an empty input", () => {
    const r = resolvePlayIdFromOrdered("", ordered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/play_id is required/);
  });

  it("rejects an empty playbook", () => {
    const empty = _buildOrderedPlaybookForTest({ plays: [], groups: [] });
    const r = resolvePlayIdFromOrdered("Recommended #1", empty);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No plays in this playbook/);
  });

  it("prefers the longer group label when group names overlap", () => {
    // Edge case: two groups whose names share a prefix. The resolver sorts
    // labels by length so "Goal Line Red Zone" wins over "Goal Line".
    const ordCollide = _buildOrderedPlaybookForTest({
      groups: [
        { id: "g-short", name: "Goal Line", sort_order: 0 },
        { id: "g-long", name: "Goal Line Red Zone", sort_order: 1 },
      ],
      plays: [
        { id: "short-1", name: "Iso", sort_order: 0, group_id: "g-short" },
        { id: "short-2", name: "Sneak", sort_order: 1, group_id: "g-short" },
        { id: "long-1", name: "Slant", sort_order: 0, group_id: "g-long" },
        { id: "long-2", name: "Fade", sort_order: 1, group_id: "g-long" },
      ],
    });
    const longer = resolvePlayIdFromOrdered("Goal Line Red Zone #2", ordCollide);
    expect(longer).toEqual({ ok: true, id: "long-2", name: "Fade" });
    const shorter = resolvePlayIdFromOrdered("Goal Line #2", ordCollide);
    expect(shorter).toEqual({ ok: true, id: "short-2", name: "Sneak" });
  });

  it("Ungrouped section comes first in display order (matches UI)", () => {
    // The orange-badge sort puts ungrouped plays before grouped ones.
    // So Ungrouped #1 is the very first play in the playbook.
    const ord2 = _buildOrderedPlaybookForTest({
      groups: [{ id: "g-a", name: "A", sort_order: 0 }],
      plays: [
        { id: "u-1", name: "First", sort_order: 0, group_id: null },
        { id: "a-1", name: "Second", sort_order: 0, group_id: "g-a" },
      ],
    });
    expect(resolvePlayIdFromOrdered("Ungrouped #1", ord2)).toEqual({
      ok: true,
      id: "u-1",
      name: "First",
    });
    expect(resolvePlayIdFromOrdered("A #1", ord2)).toEqual({
      ok: true,
      id: "a-1",
      name: "Second",
    });
  });
});

describe("resolvePlayIdFromOrdered — anchored play preference", () => {
  // When the coach has a play open in the editor and references it numerically
  // (e.g. "play 14" — matching the orange UI badge they see), the resolver
  // should prefer the anchored play and flag the result with viaAnchor so Cal
  // confirms with the coach before acting. This catches the user-reported
  // bug where "play 14" (Noah, anchored) resolved to a different play because
  // the UI badge is a global position but the resolver's bare-slot logic is
  // per-group — the two interpretations disagree.

  it("prefers the anchored play for a bare slot input", () => {
    const r = resolvePlayIdFromOrdered("5", ordered, { anchoredPlayId: "p-rec-3" });
    expect(r).toEqual({ ok: true, id: "p-rec-3", name: "Noah", viaAnchor: true });
  });

  it("prefers the anchored play even when the bare slot would otherwise be ambiguous", () => {
    // Without anchor, "1" is ambiguous (Ungrouped #1, Recommended #1, Goal Line #1).
    // With anchor, it resolves cleanly to the anchored play.
    const r = resolvePlayIdFromOrdered("1", ordered, { anchoredPlayId: "p-goal-1" });
    expect(r).toEqual({ ok: true, id: "p-goal-1", name: "Iso", viaAnchor: true });
  });

  it("prefers the anchored play for 'Play 14' / '#14' style synonyms", () => {
    // The user's reported case: the orange badge shows "14" but the resolver's
    // bare-slot logic returned a different play.
    const r1 = resolvePlayIdFromOrdered("Play 14", ordered, { anchoredPlayId: "p-rec-6" });
    expect(r1).toEqual({ ok: true, id: "p-rec-6", name: "Trips Right Flood", viaAnchor: true });
    const r2 = resolvePlayIdFromOrdered("#14", ordered, { anchoredPlayId: "p-rec-6" });
    expect(r2).toEqual({ ok: true, id: "p-rec-6", name: "Trips Right Flood", viaAnchor: true });
  });

  it("does NOT use the anchor for group-qualified references", () => {
    // "Recommended #5" is explicit — coach is naming a specific group + slot,
    // not their open play. Anchor must not override an explicit reference.
    const r = resolvePlayIdFromOrdered("Recommended #5", ordered, { anchoredPlayId: "p-rec-3" });
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
    expect((r as { viaAnchor?: boolean }).viaAnchor).toBeUndefined();
  });

  it("does NOT use the anchor for name references", () => {
    const r = resolvePlayIdFromOrdered("Sneak", ordered, { anchoredPlayId: "p-rec-3" });
    expect(r).toEqual({ ok: true, id: "p-goal-2", name: "Sneak" });
    expect((r as { viaAnchor?: boolean }).viaAnchor).toBeUndefined();
  });

  it("does NOT use the anchor for UUID references", () => {
    const ord2 = _buildOrderedPlaybookForTest({
      plays: [
        { id: "11111111-1111-1111-1111-111111111111", name: "Anchored", sort_order: 0, group_id: null },
        { id: "22222222-2222-2222-2222-222222222222", name: "Other", sort_order: 1, group_id: null },
      ],
      groups: [],
    });
    const r = resolvePlayIdFromOrdered(
      "22222222-2222-2222-2222-222222222222",
      ord2,
      { anchoredPlayId: "11111111-1111-1111-1111-111111111111" },
    );
    expect(r).toEqual({
      ok: true,
      id: "22222222-2222-2222-2222-222222222222",
      name: "Other",
    });
    expect((r as { viaAnchor?: boolean }).viaAnchor).toBeUndefined();
  });

  it("falls back to normal resolution if the anchored play is not in this playbook", () => {
    // E.g. coach navigated between playbooks while Cal was anchored elsewhere.
    const r = resolvePlayIdFromOrdered("5", ordered, { anchoredPlayId: "not-in-this-playbook" });
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
    expect((r as { viaAnchor?: boolean }).viaAnchor).toBeUndefined();
  });

  it("falls back to normal resolution if anchored play is undefined", () => {
    // Anchor is optional — calls from non-anchored chats keep working.
    const r = resolvePlayIdFromOrdered("5", ordered);
    expect(r).toEqual({ ok: true, id: "p-rec-5", name: "Trips Left Reverse" });
  });
});
