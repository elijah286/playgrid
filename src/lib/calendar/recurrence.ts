import { RRule, RRuleSet, rrulestr } from "rrule";

export type Occurrence = {
  /** ISO timestamp for the occurrence's start (preserves UTC offset). */
  startsAt: string;
  /** YYYY-MM-DD in UTC for use as an RSVP partition key. */
  occurrenceDate: string;
};

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  );
}

/**
 * Expand an event's recurrence into occurrences within [windowStart, windowEnd].
 * If recurrenceRule is null, returns a single occurrence at the event's start
 * (provided it falls within the window).
 *
 * `exdates` are ISO strings of occurrences to skip (parent EXDATE list).
 * Hard caps the result at 200 occurrences as a safety net for runaway rules.
 */
export function expandRecurrence(opts: {
  startsAt: string;
  recurrenceRule: string | null;
  exdates?: string[];
  windowStart: Date;
  windowEnd: Date;
}): Occurrence[] {
  const startMs = new Date(opts.startsAt).getTime();

  if (!opts.recurrenceRule) {
    if (startMs < opts.windowStart.getTime() || startMs > opts.windowEnd.getTime()) {
      return [];
    }
    return [
      { startsAt: opts.startsAt, occurrenceDate: ymd(new Date(opts.startsAt)) },
    ];
  }

  // The DB stores the bare RRULE clause; prepend RRULE: if missing.
  const ruleText = opts.recurrenceRule.startsWith("RRULE:")
    ? opts.recurrenceRule
    : `RRULE:${opts.recurrenceRule}`;

  let rule: RRule | RRuleSet;
  try {
    rule = rrulestr(ruleText, { dtstart: new Date(opts.startsAt) }) as
      | RRule
      | RRuleSet;
  } catch {
    // Malformed rule — fall back to single occurrence so the user still
    // sees their event rather than an empty calendar.
    return [
      { startsAt: opts.startsAt, occurrenceDate: ymd(new Date(opts.startsAt)) },
    ];
  }

  let between: Date[] = [];
  try {
    between = rule.between(opts.windowStart, opts.windowEnd, true);
  } catch {
    // A bad UNTIL/COUNT combo or other rrule edge case can throw inside
    // .between — fall back to the seed occurrence so the page still renders.
    return [
      { startsAt: opts.startsAt, occurrenceDate: ymd(new Date(opts.startsAt)) },
    ];
  }
  const exdateSet = new Set(
    (opts.exdates ?? []).map((s) => new Date(s).getTime()),
  );

  return between
    .filter((d) => !exdateSet.has(d.getTime()))
    .slice(0, 200)
    .map<Occurrence>((d) => ({
      startsAt: d.toISOString(),
      occurrenceDate: ymd(d),
    }));
}
