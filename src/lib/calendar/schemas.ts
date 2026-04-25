import { z } from "zod";

export const eventTypeSchema = z.enum(["practice", "game", "scrimmage"]);
export const homeAwaySchema = z.enum(["home", "away", "neutral"]);
export const rsvpStatusSchema = z.enum(["yes", "no", "maybe"]);

const isoTimestamp = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const eventInputSchema = z.object({
  type: eventTypeSchema,
  title: z.string().trim().min(1, "Title is required").max(200),
  startsAt: isoTimestamp,
  durationMinutes: z.number().int().min(1).max(24 * 60),
  arriveMinutesBefore: z.number().int().min(0).max(8 * 60),
  timezone: z.string().min(1).max(64),
  location: z
    .object({
      name: z.string().trim().min(1).max(200),
      address: z.string().trim().max(500).optional().nullable(),
      lat: z.number().min(-90).max(90).optional().nullable(),
      lng: z.number().min(-180).max(180).optional().nullable(),
    })
    .nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  // Game-only fields. Validated again at the action layer when type !== 'game'.
  opponent: z.string().trim().max(200).optional().nullable(),
  homeAway: homeAwaySchema.optional().nullable(),
  // iCal RRULE; keep raw — validated at use time by the rrule lib.
  recurrenceRule: z.string().trim().max(500).optional().nullable(),
  // Coach-defined reminders, expressed as offsets in minutes BEFORE starts_at.
  reminderOffsetsMinutes: z.array(z.number().int().min(0).max(14 * 24 * 60)).max(8),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const updateEventInputSchema = eventInputSchema.extend({
  notifyAttendees: z.boolean(),
});
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;

export const setRsvpInputSchema = z.object({
  eventId: z.string().uuid(),
  occurrenceDate: isoDate,
  status: rsvpStatusSchema,
  note: z.string().trim().max(500).optional().nullable(),
});
export type SetRsvpInput = z.infer<typeof setRsvpInputSchema>;

export const eventGameResultSchema = z.object({
  eventId: z.string().uuid(),
  scoreUs: z.number().int().min(0).max(999).nullable(),
  scoreThem: z.number().int().min(0).max(999).nullable(),
});
