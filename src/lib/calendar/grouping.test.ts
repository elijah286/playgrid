import { describe, expect, it } from "vitest";
import {
  groupEventsForList,
  occurrenceKey,
  summarizeGroup,
} from "./grouping";
import type { CalendarEventRow } from "@/app/actions/calendar";

function row(overrides: Partial<CalendarEventRow>): CalendarEventRow {
  return {
    id: "evt-1",
    playbookId: "pb-1",
    type: "practice",
    title: "Practice",
    startsAt: "2026-06-05T18:00:00.000Z",
    durationMinutes: 90,
    arriveMinutesBefore: 15,
    timezone: "America/Chicago",
    location: { name: "Cedar Park HS", address: null, lat: null, lng: null },
    notes: null,
    opponent: null,
    homeAway: null,
    scoreUs: null,
    scoreThem: null,
    recurrenceRule: null,
    reminderOffsetsMinutes: [],
    deletedAt: null,
    occurrenceDate: "2026-06-05",
    rsvpCounts: { yes: 0, no: 0, maybe: 0 },
    myRsvp: null,
    ...overrides,
  };
}

describe("groupEventsForList", () => {
  it("returns one singleton group per non-recurring event", () => {
    const events = [
      row({ id: "a", title: "Scrimmage A", occurrenceDate: "2026-06-05" }),
      row({ id: "b", title: "Scrimmage B", occurrenceDate: "2026-06-06" }),
      row({ id: "c", title: "Scrimmage C", occurrenceDate: "2026-06-07" }),
    ];
    const groups = groupEventsForList(events);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.kind === "single")).toBe(true);
  });

  it("rolls up multiple occurrences of one series into a single group", () => {
    const events = [
      row({
        id: "series-1",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=FR",
        occurrenceDate: "2026-05-22",
        startsAt: "2026-05-22T23:00:00.000Z",
      }),
      row({
        id: "series-1",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=FR",
        occurrenceDate: "2026-05-29",
        startsAt: "2026-05-29T23:00:00.000Z",
      }),
      row({
        id: "series-1",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=FR",
        occurrenceDate: "2026-06-05",
        startsAt: "2026-06-05T23:00:00.000Z",
      }),
    ];
    const groups = groupEventsForList(events);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("series");
    if (groups[0]!.kind === "series") {
      expect(groups[0]!.occurrences).toHaveLength(3);
      expect(groups[0]!.parentId).toBe("series-1");
    }
  });

  it("treats a series with only one occurrence in-window as a singleton", () => {
    const events = [
      row({
        id: "series-2",
        recurrenceRule: "FREQ=WEEKLY",
        occurrenceDate: "2026-06-05",
      }),
    ];
    const groups = groupEventsForList(events);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("single");
  });

  it("preserves chronological order across mixed series + singletons", () => {
    const events = [
      row({
        id: "a-single",
        title: "One-off A",
        occurrenceDate: "2026-05-20",
        startsAt: "2026-05-20T18:00:00.000Z",
      }),
      row({
        id: "series-1",
        recurrenceRule: "FREQ=WEEKLY",
        occurrenceDate: "2026-05-22",
        startsAt: "2026-05-22T23:00:00.000Z",
      }),
      row({
        id: "b-single",
        title: "One-off B",
        occurrenceDate: "2026-05-25",
        startsAt: "2026-05-25T18:00:00.000Z",
      }),
      row({
        id: "series-1",
        recurrenceRule: "FREQ=WEEKLY",
        occurrenceDate: "2026-05-29",
        startsAt: "2026-05-29T23:00:00.000Z",
      }),
    ];
    const groups = groupEventsForList(events);
    // Series anchors at the earliest occurrence (2026-05-22), so order
    // is: one-off A, series, one-off B.
    expect(groups).toHaveLength(3);
    expect(groups[0]!.kind).toBe("single");
    expect(groups[1]!.kind).toBe("series");
    expect(groups[2]!.kind).toBe("single");
    if (groups[0]!.kind === "single")
      expect(groups[0]!.event.title).toBe("One-off A");
    if (groups[2]!.kind === "single")
      expect(groups[2]!.event.title).toBe("One-off B");
  });

  it("does NOT roll up events that share an id but lack a recurrence rule", () => {
    // Per-occurrence overrides come back with their own id, so this
    // collision shouldn't happen in practice — but the guard is here to
    // be defensive against any future write path that fans out.
    const events = [
      row({ id: "x", recurrenceRule: null, occurrenceDate: "2026-06-05" }),
      row({ id: "x", recurrenceRule: null, occurrenceDate: "2026-06-06" }),
    ];
    const groups = groupEventsForList(events);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.kind === "single")).toBe(true);
  });
});

describe("occurrenceKey", () => {
  it("combines event id and occurrence date", () => {
    expect(
      occurrenceKey({ id: "evt-1", occurrenceDate: "2026-06-05" }),
    ).toBe("evt-1:2026-06-05");
  });
});

describe("summarizeGroup", () => {
  const NOW = new Date("2026-05-25T12:00:00.000Z").getTime();

  it("counts unresponded, responded, and locked occurrences correctly", () => {
    const group = {
      kind: "series" as const,
      parentId: "series-1",
      occurrences: [
        row({
          id: "series-1",
          recurrenceRule: "FREQ=WEEKLY",
          occurrenceDate: "2026-05-15",
          startsAt: "2026-05-15T23:00:00.000Z",
          myRsvp: { status: "yes", note: null },
        }),
        row({
          id: "series-1",
          recurrenceRule: "FREQ=WEEKLY",
          occurrenceDate: "2026-05-29",
          startsAt: "2026-05-29T23:00:00.000Z",
          myRsvp: null,
        }),
        row({
          id: "series-1",
          recurrenceRule: "FREQ=WEEKLY",
          occurrenceDate: "2026-06-05",
          startsAt: "2026-06-05T23:00:00.000Z",
          myRsvp: { status: "yes", note: null },
        }),
        row({
          id: "series-1",
          recurrenceRule: "FREQ=WEEKLY",
          occurrenceDate: "2026-06-12",
          startsAt: "2026-06-12T23:00:00.000Z",
          myRsvp: null,
        }),
      ],
    };
    const summary = summarizeGroup(group, NOW);
    expect(summary.total).toBe(4);
    expect(summary.upcoming).toBe(3); // 2026-05-15 is past
    expect(summary.lockedCount).toBe(1);
    expect(summary.respondedCount).toBe(1); // 2026-06-05 is upcoming + responded
    expect(summary.unrespondedOccurrences.map((o) => o.occurrenceDate)).toEqual(
      ["2026-05-29", "2026-06-12"],
    );
  });

  it("returns no unresponded occurrences when all upcoming have RSVPs", () => {
    const group = {
      kind: "series" as const,
      parentId: "series-1",
      occurrences: [
        row({
          id: "series-1",
          recurrenceRule: "FREQ=WEEKLY",
          occurrenceDate: "2026-06-05",
          startsAt: "2026-06-05T23:00:00.000Z",
          myRsvp: { status: "maybe", note: null },
        }),
      ],
    };
    const summary = summarizeGroup(group, NOW);
    expect(summary.unrespondedOccurrences).toHaveLength(0);
  });
});
