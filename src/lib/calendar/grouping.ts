import type { CalendarEventRow } from "@/app/actions/calendar";

/**
 * Group a flat list of event-occurrence rows into series rollups + singletons.
 *
 * A "series group" is multiple rows that share the same parent event id and
 * carry a recurrence rule — i.e. the rows the recurrence expander generated
 * from one DB row. They get collapsed into a single card so the user isn't
 * staring at seven identical "Practice / Chiefs Girls / 6:00 PM" cards.
 *
 * A series with only one in-window occurrence (e.g. an RRULE that's mostly
 * past, or a series with a near-future UNTIL) is rendered as a single card —
 * collapsing one row gives the user no value and the toolbar's batch button
 * would be misleading.
 *
 * Order within a group preserves the input order (which the caller has
 * already sorted by startsAt). Groups are returned in the order of their
 * earliest occurrence, matching the existing chronological list.
 */
export type EventGroup<T extends CalendarEventRow = CalendarEventRow> =
  | { kind: "series"; parentId: string; occurrences: T[] }
  | { kind: "single"; event: T };

export function groupEventsForList<T extends CalendarEventRow>(
  events: T[],
): EventGroup<T>[] {
  // Bucket rows by parent id, but only for rows that came from a recurring
  // series. Non-recurring rows (one-off events, per-occurrence override rows
  // that have their own id) pass through as singletons.
  const seriesBuckets = new Map<string, T[]>();
  const singletons: { event: T; index: number }[] = [];
  const firstSeenAt = new Map<string, number>();

  events.forEach((event, index) => {
    if (event.recurrenceRule) {
      const bucket = seriesBuckets.get(event.id) ?? [];
      bucket.push(event);
      seriesBuckets.set(event.id, bucket);
      if (!firstSeenAt.has(event.id)) firstSeenAt.set(event.id, index);
    } else {
      singletons.push({ event, index });
    }
  });

  type Indexed = { index: number; group: EventGroup<T> };
  const out: Indexed[] = [];

  for (const [parentId, occurrences] of seriesBuckets.entries()) {
    if (occurrences.length < 2) {
      out.push({
        index: firstSeenAt.get(parentId)!,
        group: { kind: "single", event: occurrences[0]! },
      });
      continue;
    }
    out.push({
      index: firstSeenAt.get(parentId)!,
      group: { kind: "series", parentId, occurrences },
    });
  }
  for (const s of singletons) {
    out.push({ index: s.index, group: { kind: "single", event: s.event } });
  }

  out.sort((a, b) => a.index - b.index);
  return out.map((entry) => entry.group);
}

/** Stable key for an occurrence row across renders + selection sets. */
export function occurrenceKey(
  event: Pick<CalendarEventRow, "id" | "occurrenceDate">,
): string {
  return `${event.id}:${event.occurrenceDate}`;
}

/**
 * Group-level summary used by the rollup card and the bulk-action bar:
 *   - unrespondedOccurrences: rows the viewer hasn't RSVP'd to (and are not
 *     locked by lockout). These are what a "Going" tap on the collapsed
 *     card would actually write.
 *   - lockedCount: occurrences whose start time has passed; we can't
 *     RSVP to those, so they're excluded from the batch.
 */
export function summarizeGroup<T extends CalendarEventRow>(
  group: Extract<EventGroup<T>, { kind: "series" }>,
  now: number = Date.now(),
): {
  total: number;
  upcoming: number;
  unrespondedOccurrences: T[];
  respondedCount: number;
  lockedCount: number;
} {
  const upcoming = group.occurrences.filter(
    (o) => new Date(o.startsAt).getTime() > now,
  );
  const unresponded = upcoming.filter((o) => o.myRsvp == null);
  const responded = upcoming.length - unresponded.length;
  return {
    total: group.occurrences.length,
    upcoming: upcoming.length,
    unrespondedOccurrences: unresponded,
    respondedCount: responded,
    lockedCount: group.occurrences.length - upcoming.length,
  };
}
