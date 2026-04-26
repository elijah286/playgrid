// Minimal RFC 5545 generator. Calendar clients (Apple, Google, Outlook)
// expand RRULE themselves, so we ship the raw event + RRULE and let them
// do the work — keeps this dependency-free.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export type IcsEvent = {
  id: string;
  playbookId: string;
  type: "practice" | "game" | "scrimmage" | "other";
  title: string;
  startsAt: string; // ISO with offset
  durationMinutes: number;
  arriveMinutesBefore: number;
  locationName: string | null;
  locationAddress: string | null;
  notes: string | null;
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | null;
  recurrenceRule: string | null;
  updatedAt: string;
};

function toUtcStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  // RFC 5545: lines must be ≤75 octets; continuation lines start with a space.
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    out.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return out.join("\r\n");
}

function eventBlock(ev: IcsEvent): string {
  const start = toUtcStamp(ev.startsAt);
  const endIso = new Date(
    new Date(ev.startsAt).getTime() + ev.durationMinutes * 60_000,
  ).toISOString();
  const end = toUtcStamp(endIso);
  const stamp = toUtcStamp(ev.updatedAt);
  const summaryParts: string[] = [];
  if (ev.type === "game") {
    summaryParts.push(
      ev.opponent ? `Game vs ${ev.opponent}` : ev.title || "Game",
    );
    if (ev.homeAway && ev.homeAway !== "neutral") {
      summaryParts.push(`(${ev.homeAway})`);
    }
  } else if (ev.type === "scrimmage") {
    summaryParts.push(
      ev.opponent ? `Scrimmage vs ${ev.opponent}` : ev.title || "Scrimmage",
    );
  } else {
    summaryParts.push(ev.title || "Practice");
  }
  const summary = summaryParts.join(" ");

  const descParts: string[] = [];
  if (ev.arriveMinutesBefore > 0) {
    descParts.push(`Arrive ${ev.arriveMinutesBefore} min early.`);
  }
  if (ev.notes) descParts.push(ev.notes);
  descParts.push(`${SITE_URL}/playbooks/${ev.playbookId}?tab=calendar`);
  const description = descParts.join("\n\n");

  const locationParts: string[] = [];
  if (ev.locationName) locationParts.push(ev.locationName);
  if (ev.locationAddress) locationParts.push(ev.locationAddress);
  const location = locationParts.join(", ");

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${ev.id}@xogridmaker`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (ev.recurrenceRule) {
    // RRULE is already in iCal form (e.g. "FREQ=WEEKLY;BYDAY=MO,WE")
    lines.push(`RRULE:${ev.recurrenceRule}`);
  }
  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

export function buildIcsFeed(opts: {
  calendarName: string;
  events: IcsEvent[];
}): string {
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//xogridmaker//Team Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
  ].map(foldLine);

  const body = opts.events.map(eventBlock);

  return [...header, ...body, "END:VCALENDAR", ""].join("\r\n");
}
