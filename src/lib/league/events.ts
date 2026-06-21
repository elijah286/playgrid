// Shared league-event constants + types. Plain module (NOT "use server") so it
// can export values — server actions live in src/app/actions/league-events.ts.

export const EVENT_KINDS = ["practice", "game", "event", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type LeagueEventRow = {
  id: string;
  kind: EventKind;
  title: string;
  startsAt: string;
  location: string | null;
  notes: string | null;
};

export type LeagueEventInput = {
  title: string;
  kind: EventKind;
  startsAt: string;
  location?: string | null;
  notes?: string | null;
};
