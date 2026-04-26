"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendCalendarEventEmails } from "@/lib/calendar/notifications";
import { expandRecurrence } from "@/lib/calendar/recurrence";
import {
  eventInputSchema,
  updateEventInputSchema,
  setRsvpInputSchema,
  eventGameResultSchema,
  type EventInput,
} from "@/lib/calendar/schemas";

type Ok<T = unknown> = T extends Record<string, never>
  ? { ok: true }
  : { ok: true } & T;
type Err = { ok: false; error: string };

async function requireUser() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, supabase, userId: user.id };
}

async function isCoachOf(playbookId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_edit_playbook", {
    pb: playbookId,
  });
  if (error) return false;
  return Boolean(data);
}

async function isMemberOf(playbookId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_view_playbook", {
    pb: playbookId,
  });
  if (error) return false;
  return Boolean(data);
}

function eventRowToInput(input: EventInput, playbookId: string, createdBy: string) {
  const isGame = input.type === "game";
  return {
    playbook_id: playbookId,
    type: input.type,
    title: input.title,
    starts_at: input.startsAt,
    duration_minutes: input.durationMinutes,
    arrive_minutes_before: input.arriveMinutesBefore,
    timezone: input.timezone,
    location_name: input.location?.name ?? null,
    location_address: input.location?.address ?? null,
    location_lat: input.location?.lat ?? null,
    location_lng: input.location?.lng ?? null,
    notes: input.notes ?? null,
    opponent: isGame ? input.opponent ?? null : null,
    home_away: isGame ? input.homeAway ?? null : null,
    recurrence_rule: input.recurrenceRule ?? null,
    reminder_offsets_minutes: input.reminderOffsetsMinutes,
    created_by: createdBy,
  };
}

async function fanoutNotifications(
  admin: ReturnType<typeof createServiceRoleClient>,
  eventId: string,
  playbookId: string,
  kind: "created" | "edited" | "cancelled",
  excludeUserId: string | null,
) {
  const { data: members, error } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", playbookId);
  if (error || !members) return;
  const rows = members
    .filter((m) => m.user_id !== excludeUserId)
    .map((m) => ({
      event_id: eventId,
      user_id: m.user_id,
      kind,
    }));
  if (rows.length === 0) return;
  // Detach fanout from the request lifecycle. The event is already saved,
  // and emails to N members can outlast the action's serverless budget —
  // letting them block was crashing the post-action revalidation render.
  // `after()` runs once the response has been streamed; errors here are
  // swallowed so they never surface to the user.
  after(async () => {
    try {
      await admin.from("playbook_event_notifications").insert(rows);
    } catch {}
    try {
      await sendCalendarEventEmails({
        admin,
        eventId,
        kind,
        excludeUserId,
      });
    } catch {}
  });
}

// ─── Create ───────────────────────────────────────────────────────────────
export async function createEventAction(
  playbookId: string,
  rawInput: unknown,
): Promise<Ok<{ id: string }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  if (!(await isCoachOf(playbookId))) {
    return { ok: false, error: "Only coaches can create events." };
  }

  const parsed = eventInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  const { data: inserted, error } = await admin
    .from("playbook_events")
    .insert(eventRowToInput(input, playbookId, gate.userId))
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Could not create event." };
  }

  await fanoutNotifications(admin, inserted.id, playbookId, "created", gate.userId);

  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true, id: inserted.id };
}

// ─── Update ───────────────────────────────────────────────────────────────
export async function updateEventAction(
  eventId: string,
  rawInput: unknown,
): Promise<Ok | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const parsed = updateEventInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("playbook_events")
    .select("playbook_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Event not found." };
  if (!(await isCoachOf(existing.playbook_id))) {
    return { ok: false, error: "Only coaches can edit events." };
  }

  const { error } = await admin
    .from("playbook_events")
    .update(eventRowToInput(input, existing.playbook_id, gate.userId))
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };

  if (input.notifyAttendees) {
    await fanoutNotifications(
      admin,
      eventId,
      existing.playbook_id,
      "edited",
      gate.userId,
    );
  }

  revalidatePath(`/playbooks/${existing.playbook_id}`);
  return { ok: true };
}

// ─── Delete ───────────────────────────────────────────────────────────────
export async function deleteEventAction(
  eventId: string,
  notifyAttendees: boolean,
): Promise<Ok | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("playbook_events")
    .select("playbook_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Event not found." };
  if (!(await isCoachOf(existing.playbook_id))) {
    return { ok: false, error: "Only coaches can delete events." };
  }

  // Soft-delete so we can keep showing it (greyed-out) on past lists.
  const { error } = await admin
    .from("playbook_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };

  if (notifyAttendees) {
    await fanoutNotifications(
      admin,
      eventId,
      existing.playbook_id,
      "cancelled",
      gate.userId,
    );
  }

  revalidatePath(`/playbooks/${existing.playbook_id}`);
  return { ok: true };
}

// ─── Recurrence-scoped edit / delete ──────────────────────────────────────
//
// "this"      → add this occurrence's datetime to the parent's EXDATE list.
//               For an edit, also INSERT an override event row carrying the
//               new payload, with recurrence_parent_id pointing at the parent.
// "following" → rewrite the parent's RRULE to end just before this
//               occurrence (UNTIL=occStart-1s). For an edit, INSERT a new
//               recurring event starting at the occurrence with the new
//               payload + its own RRULE (defaults to the parent's RRULE
//               when the user didn't change it).
// "all"       → straight-through to update/delete the parent row.

function occurrenceStartIso(seriesStartIso: string, occurrenceDate: string): string {
  const series = new Date(seriesStartIso);
  const [y, m, d] = occurrenceDate.split("-").map(Number);
  const occ = new Date(
    Date.UTC(
      y,
      m - 1,
      d,
      series.getUTCHours(),
      series.getUTCMinutes(),
      series.getUTCSeconds(),
    ),
  );
  return occ.toISOString();
}

function rruleWithUntil(rule: string, untilIso: string): string {
  // RRULE UNTIL must be a UTC instant in the form 19980119T070000Z
  const u = new Date(untilIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}` +
    `T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}${pad(u.getUTCSeconds())}Z`;
  // Strip any existing UNTIL or COUNT — they can't coexist with our new UNTIL.
  const parts = rule
    .split(";")
    .filter(
      (p) => !p.toUpperCase().startsWith("UNTIL=") && !p.toUpperCase().startsWith("COUNT="),
    );
  parts.push(`UNTIL=${stamp}`);
  return parts.join(";");
}

const recurrenceScopeSchema = z.enum(["this", "following", "all"]);

const occurrenceUpdateInputSchema = updateEventInputSchema.extend({
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: recurrenceScopeSchema,
});

export async function updateEventOccurrenceAction(
  eventId: string,
  rawInput: unknown,
): Promise<Ok | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const parsed = occurrenceUpdateInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { scope, occurrenceDate, notifyAttendees, ...inputCore } = parsed.data;
  const input = { ...inputCore, notifyAttendees };

  if (scope === "all") {
    return updateEventAction(eventId, input);
  }

  const admin = createServiceRoleClient();
  const { data: parent } = await admin
    .from("playbook_events")
    .select(
      "playbook_id, starts_at, recurrence_rule, recurrence_exdate",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!parent) return { ok: false, error: "Event not found." };
  if (!parent.recurrence_rule) {
    // Not actually recurring — fall back to a normal update.
    return updateEventAction(eventId, input);
  }
  if (!(await isCoachOf(parent.playbook_id))) {
    return { ok: false, error: "Only coaches can edit events." };
  }

  const occIso = occurrenceStartIso(parent.starts_at, occurrenceDate);

  if (scope === "this") {
    const exdates = [...((parent.recurrence_exdate as string[] | null) ?? []), occIso];
    const { error: pErr } = await admin
      .from("playbook_events")
      .update({ recurrence_exdate: exdates })
      .eq("id", eventId);
    if (pErr) return { ok: false, error: pErr.message };

    const overrideRow = {
      ...eventRowToInput({ ...input, recurrenceRule: null }, parent.playbook_id, gate.userId),
      recurrence_parent_id: eventId,
    };
    const { error: insErr } = await admin
      .from("playbook_events")
      .insert(overrideRow);
    if (insErr) return { ok: false, error: insErr.message };
  } else {
    // "following" — bound the original series and create a new one starting
    // at this occurrence with the new payload + its own recurrence.
    const newParentRule = rruleWithUntil(
      parent.recurrence_rule as string,
      new Date(new Date(occIso).getTime() - 1000).toISOString(),
    );
    const { error: pErr } = await admin
      .from("playbook_events")
      .update({ recurrence_rule: newParentRule })
      .eq("id", eventId);
    if (pErr) return { ok: false, error: pErr.message };

    const followingRule =
      input.recurrenceRule ?? (parent.recurrence_rule as string);
    const { error: insErr } = await admin
      .from("playbook_events")
      .insert(
        eventRowToInput(
          { ...input, startsAt: occIso, recurrenceRule: followingRule },
          parent.playbook_id,
          gate.userId,
        ),
      );
    if (insErr) return { ok: false, error: insErr.message };
  }

  if (notifyAttendees) {
    await fanoutNotifications(admin, eventId, parent.playbook_id, "edited", gate.userId);
  }
  revalidatePath(`/playbooks/${parent.playbook_id}`);
  return { ok: true };
}

const occurrenceDeleteInputSchema = z.object({
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: recurrenceScopeSchema,
  notifyAttendees: z.boolean(),
});

export async function deleteEventOccurrenceAction(
  eventId: string,
  rawInput: unknown,
): Promise<Ok | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const parsed = occurrenceDeleteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { scope, occurrenceDate, notifyAttendees } = parsed.data;

  if (scope === "all") {
    return deleteEventAction(eventId, notifyAttendees);
  }

  const admin = createServiceRoleClient();
  const { data: parent } = await admin
    .from("playbook_events")
    .select("playbook_id, starts_at, recurrence_rule, recurrence_exdate")
    .eq("id", eventId)
    .maybeSingle();
  if (!parent) return { ok: false, error: "Event not found." };
  if (!parent.recurrence_rule) {
    return deleteEventAction(eventId, notifyAttendees);
  }
  if (!(await isCoachOf(parent.playbook_id))) {
    return { ok: false, error: "Only coaches can delete events." };
  }

  const occIso = occurrenceStartIso(parent.starts_at, occurrenceDate);

  if (scope === "this") {
    const exdates = [...((parent.recurrence_exdate as string[] | null) ?? []), occIso];
    const { error } = await admin
      .from("playbook_events")
      .update({ recurrence_exdate: exdates })
      .eq("id", eventId);
    if (error) return { ok: false, error: error.message };
  } else {
    const newRule = rruleWithUntil(
      parent.recurrence_rule as string,
      new Date(new Date(occIso).getTime() - 1000).toISOString(),
    );
    const { error } = await admin
      .from("playbook_events")
      .update({ recurrence_rule: newRule })
      .eq("id", eventId);
    if (error) return { ok: false, error: error.message };
  }

  if (notifyAttendees) {
    await fanoutNotifications(admin, eventId, parent.playbook_id, "cancelled", gate.userId);
  }
  revalidatePath(`/playbooks/${parent.playbook_id}`);
  return { ok: true };
}

// ─── Game result ──────────────────────────────────────────────────────────
export async function setEventGameResultAction(
  rawInput: unknown,
): Promise<Ok | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const parsed = eventGameResultSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("playbook_events")
    .select("playbook_id, type")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Event not found." };
  if (existing.type !== "game") {
    return { ok: false, error: "Only games can have a result." };
  }
  if (!(await isCoachOf(existing.playbook_id))) {
    return { ok: false, error: "Only coaches can record results." };
  }
  const { error } = await admin
    .from("playbook_events")
    .update({
      score_us: parsed.data.scoreUs,
      score_them: parsed.data.scoreThem,
    })
    .eq("id", parsed.data.eventId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${existing.playbook_id}`);
  return { ok: true };
}

// ─── RSVP ─────────────────────────────────────────────────────────────────
export async function setRsvpAction(
  rawInput: unknown,
): Promise<Ok | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const parsed = setRsvpInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { eventId, occurrenceDate, status, note } = parsed.data;

  // Don't allow RSVP after the event has started — match the product rule.
  const admin = createServiceRoleClient();
  const { data: ev } = await admin
    .from("playbook_events")
    .select("playbook_id, starts_at, recurrence_rule")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return { ok: false, error: "Event not found." };
  if (!(await isMemberOf(ev.playbook_id))) {
    return { ok: false, error: "You don't have access to this event." };
  }
  // Lock RSVP once the specific occurrence has started. For non-recurring
  // events the occurrence date matches starts_at; for recurring events we
  // pin the occurrence's start to (date @ event's time-of-day in UTC).
  const seriesStart = new Date(ev.starts_at);
  const [y, m, d] = occurrenceDate.split("-").map(Number);
  const occStart = new Date(
    Date.UTC(
      y,
      m - 1,
      d,
      seriesStart.getUTCHours(),
      seriesStart.getUTCMinutes(),
      seriesStart.getUTCSeconds(),
    ),
  );
  if (occStart.getTime() <= Date.now()) {
    return { ok: false, error: "RSVPs are locked once the event has started." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_event_rsvps")
    .upsert(
      {
        event_id: eventId,
        user_id: gate.userId,
        occurrence_date: occurrenceDate,
        status,
        note: note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id,occurrence_date" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/playbooks/${ev.playbook_id}`);
  return { ok: true };
}

export async function clearRsvpAction(
  eventId: string,
  occurrenceDate: string,
): Promise<Ok | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_event_rsvps")
    .delete()
    .match({
      event_id: eventId,
      user_id: gate.userId,
      occurrence_date: occurrenceDate,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Calendar feed token ──────────────────────────────────────────────────
export async function getOrCreateCalendarTokenAction(
  playbookId: string,
): Promise<Ok<{ token: string }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  if (!(await isMemberOf(playbookId))) {
    return { ok: false, error: "No access to this playbook." };
  }
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("playbook_calendar_tokens")
    .select("token")
    .eq("playbook_id", playbookId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: true, token: existing.token };

  // Only coaches can mint a new token. Players see "no link yet."
  if (!(await isCoachOf(playbookId))) {
    return {
      ok: false,
      error:
        "Calendar feed link hasn't been generated yet — ask a coach to enable it.",
    };
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const { error } = await admin.from("playbook_calendar_tokens").insert({
    playbook_id: playbookId,
    token,
    created_by: gate.userId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token };
}

export async function regenerateCalendarTokenAction(
  playbookId: string,
): Promise<Ok<{ token: string }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  if (!(await isCoachOf(playbookId))) {
    return { ok: false, error: "Only coaches can rotate the calendar link." };
  }
  const admin = createServiceRoleClient();
  await admin
    .from("playbook_calendar_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("playbook_id", playbookId)
    .is("revoked_at", null);
  const token = crypto.randomUUID().replace(/-/g, "");
  const { error } = await admin.from("playbook_calendar_tokens").insert({
    playbook_id: playbookId,
    token,
    created_by: gate.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true, token };
}

// ─── Notifications (badge) ────────────────────────────────────────────────
export async function markCalendarSeenAction(
  playbookId: string | null,
): Promise<Ok<{ marked: number }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const admin = createServiceRoleClient();
  let q = admin
    .from("playbook_event_notifications")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", gate.userId)
    .is("seen_at", null);
  if (playbookId) {
    // Scope to this playbook's events only.
    const { data: ids } = await admin
      .from("playbook_events")
      .select("id")
      .eq("playbook_id", playbookId);
    const eventIds = (ids ?? []).map((r) => r.id);
    if (eventIds.length === 0) return { ok: true, marked: 0 };
    q = q.in("event_id", eventIds);
  }
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, marked: data?.length ?? 0 };
}

export async function getUnseenCalendarCountAction(
  playbookId: string | null,
): Promise<Ok<{ count: number }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const admin = createServiceRoleClient();
  if (!playbookId) {
    const { count, error } = await admin
      .from("playbook_event_notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", gate.userId)
      .is("seen_at", null);
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: count ?? 0 };
  }
  const { data: ids } = await admin
    .from("playbook_events")
    .select("id")
    .eq("playbook_id", playbookId);
  const eventIds = (ids ?? []).map((r) => r.id);
  if (eventIds.length === 0) return { ok: true, count: 0 };
  const { count, error } = await admin
    .from("playbook_event_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", gate.userId)
    .is("seen_at", null)
    .in("event_id", eventIds);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

/**
 * Count upcoming events in this playbook (or across all playbooks when null)
 * for which the viewer hasn't yet recorded an RSVP, plus the total number
 * of upcoming events. The Calendar tab badge uses pending (red) when > 0,
 * otherwise upcomingTotal (gray) so the user always sees a useful figure.
 */
export async function getCalendarRsvpPendingCountAction(
  playbookId: string | null,
): Promise<Ok<{ pending: number; upcomingTotal: number }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const now = Date.now();
  const tally = (events: CalendarEventRow[]) => {
    let pending = 0;
    let upcomingTotal = 0;
    for (const e of events) {
      const end = new Date(e.startsAt).getTime() + e.durationMinutes * 60_000;
      if (end < now) continue;
      upcomingTotal += 1;
      if (!e.myRsvp) pending += 1;
    }
    return { pending, upcomingTotal };
  };
  if (playbookId) {
    const res = await listEventsForPlaybookAction(playbookId);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, ...tally(res.events) };
  }
  const res = await listUpcomingEventsAcrossPlaybooksAction();
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, ...tally(res.events) };
}

// ─── Listing ──────────────────────────────────────────────────────────────
export type CalendarEventRow = {
  id: string;
  playbookId: string;
  type: "practice" | "game" | "scrimmage" | "other";
  title: string;
  startsAt: string;
  durationMinutes: number;
  arriveMinutesBefore: number;
  timezone: string;
  location: {
    name: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
  notes: string | null;
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | null;
  scoreUs: number | null;
  scoreThem: number | null;
  recurrenceRule: string | null;
  reminderOffsetsMinutes: number[];
  deletedAt: string | null;
  /** YYYY-MM-DD partition key used by per-occurrence RSVPs. */
  occurrenceDate: string;
  rsvpCounts: { yes: number; no: number; maybe: number };
  myRsvp: { status: "yes" | "no" | "maybe"; note: string | null } | null;
};

export async function listEventsForPlaybookAction(
  playbookId: string,
): Promise<Ok<{ events: CalendarEventRow[] }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  if (!(await isMemberOf(playbookId))) {
    return { ok: false, error: "No access to this playbook." };
  }

  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from("playbook_events")
    .select(
      "id, playbook_id, type, title, starts_at, duration_minutes, arrive_minutes_before, timezone, location_name, location_address, location_lat, location_lng, notes, opponent, home_away, score_us, score_them, recurrence_rule, recurrence_exdate, reminder_offsets_minutes, deleted_at",
    )
    .eq("playbook_id", playbookId)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const eventIds = (events ?? []).map((e) => e.id as string);
  if (eventIds.length === 0) {
    return { ok: true, events: [] };
  }

  const rsvpsRes = await supabase
    .from("playbook_event_rsvps")
    .select("event_id, user_id, occurrence_date, status, note")
    .in("event_id", eventIds);

  type RsvpRow = {
    event_id: string;
    user_id: string;
    occurrence_date: string;
    status: "yes" | "no" | "maybe";
    note: string | null;
  };
  const rsvps = (rsvpsRes.data ?? []) as RsvpRow[];

  type EventRow = {
    id: string;
    playbook_id: string;
    type: "practice" | "game" | "scrimmage" | "other";
    title: string;
    starts_at: string;
    duration_minutes: number;
    arrive_minutes_before: number;
    timezone: string;
    location_name: string | null;
    location_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
    notes: string | null;
    opponent: string | null;
    home_away: "home" | "away" | "neutral" | null;
    score_us: number | null;
    score_them: number | null;
    recurrence_rule: string | null;
    recurrence_exdate: string[] | null;
    reminder_offsets_minutes: number[] | null;
    deleted_at: string | null;
  };

  // Expand recurring events to one row per occurrence in a 6-month window
  // (60 days back so "Past" still shows recent occurrences, 6 months forward
  // for upcoming). Non-recurring events return one row.
  const windowStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  const rows: CalendarEventRow[] = [];
  for (const e of events as EventRow[]) {
    const reminderOffsetsMinutes = e.reminder_offsets_minutes ?? [];

    const occurrences = expandRecurrence({
      startsAt: e.starts_at,
      recurrenceRule: e.recurrence_rule,
      exdates: e.recurrence_exdate ?? [],
      windowStart,
      windowEnd,
    });

    for (const occ of occurrences) {
      const myRsvp = rsvps.find(
        (r) =>
          r.event_id === e.id &&
          r.user_id === gate.userId &&
          r.occurrence_date === occ.occurrenceDate,
      );
      const counts = { yes: 0, no: 0, maybe: 0 };
      for (const r of rsvps) {
        if (r.event_id !== e.id) continue;
        if (r.occurrence_date !== occ.occurrenceDate) continue;
        counts[r.status] += 1;
      }
      rows.push({
        id: e.id,
        playbookId: e.playbook_id,
        type: e.type,
        title: e.title,
        startsAt: occ.startsAt,
        durationMinutes: e.duration_minutes,
        arriveMinutesBefore: e.arrive_minutes_before,
        timezone: e.timezone,
        location: {
          name: e.location_name,
          address: e.location_address,
          lat: e.location_lat,
          lng: e.location_lng,
        },
        notes: e.notes,
        opponent: e.opponent,
        homeAway: e.home_away,
        scoreUs: e.score_us,
        scoreThem: e.score_them,
        recurrenceRule: e.recurrence_rule,
        reminderOffsetsMinutes,
        deletedAt: e.deleted_at,
        occurrenceDate: occ.occurrenceDate,
        rsvpCounts: counts,
        myRsvp: myRsvp ? { status: myRsvp.status, note: myRsvp.note } : null,
      });
    }
  }
  rows.sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  return { ok: true, events: rows };
}

export type CrossPlaybookEventRow = CalendarEventRow & {
  playbookName: string;
  playbookColor: string | null;
};

export async function listUpcomingEventsAcrossPlaybooksAction(): Promise<
  Ok<{ events: CrossPlaybookEventRow[] }> | Err
> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", gate.userId);
  const playbookIds = (memberships ?? []).map((m) => m.playbook_id as string);
  if (playbookIds.length === 0) return { ok: true, events: [] };

  const { data: events, error } = await supabase
    .from("playbook_events")
    .select(
      "id, playbook_id, type, title, starts_at, duration_minutes, arrive_minutes_before, timezone, location_name, location_address, location_lat, location_lng, notes, opponent, home_away, score_us, score_them, recurrence_rule, recurrence_exdate, deleted_at",
    )
    .in("playbook_id", playbookIds)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const eventIds = (events ?? []).map((e) => e.id as string);
  const [rsvpsRes, pbRes] = await Promise.all([
    eventIds.length > 0
      ? supabase
          .from("playbook_event_rsvps")
          .select("event_id, user_id, occurrence_date, status, note")
          .in("event_id", eventIds)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("playbooks")
      .select("id, name, color")
      .in("id", playbookIds),
  ]);

  type RsvpRow = {
    event_id: string;
    user_id: string;
    occurrence_date: string;
    status: "yes" | "no" | "maybe";
    note: string | null;
  };
  type PbRow = { id: string; name: string; color: string | null };
  const rsvps = (rsvpsRes.data ?? []) as RsvpRow[];
  const pbs = (pbRes.data ?? []) as PbRow[];
  const pbById = new Map(pbs.map((p) => [p.id, p]));

  type EventRow = {
    id: string;
    playbook_id: string;
    type: "practice" | "game" | "scrimmage" | "other";
    title: string;
    starts_at: string;
    duration_minutes: number;
    arrive_minutes_before: number;
    timezone: string;
    location_name: string | null;
    location_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
    notes: string | null;
    opponent: string | null;
    home_away: "home" | "away" | "neutral" | null;
    score_us: number | null;
    score_them: number | null;
    recurrence_rule: string | null;
    recurrence_exdate: string[] | null;
    deleted_at: string | null;
  };

  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  const rows: CrossPlaybookEventRow[] = [];
  for (const e of events as EventRow[]) {
    const occurrences = expandRecurrence({
      startsAt: e.starts_at,
      recurrenceRule: e.recurrence_rule,
      exdates: e.recurrence_exdate ?? [],
      windowStart,
      windowEnd,
    });
    const pb = pbById.get(e.playbook_id);
    for (const occ of occurrences) {
      const myRsvp = rsvps.find(
        (r) =>
          r.event_id === e.id &&
          r.user_id === gate.userId &&
          r.occurrence_date === occ.occurrenceDate,
      );
      const counts = { yes: 0, no: 0, maybe: 0 };
      for (const r of rsvps) {
        if (r.event_id !== e.id) continue;
        if (r.occurrence_date !== occ.occurrenceDate) continue;
        counts[r.status] += 1;
      }
      rows.push({
        id: e.id,
        playbookId: e.playbook_id,
        type: e.type,
        title: e.title,
        startsAt: occ.startsAt,
        durationMinutes: e.duration_minutes,
        arriveMinutesBefore: e.arrive_minutes_before,
        timezone: e.timezone,
        location: {
          name: e.location_name,
          address: e.location_address,
          lat: e.location_lat,
          lng: e.location_lng,
        },
        notes: e.notes,
        opponent: e.opponent,
        homeAway: e.home_away,
        scoreUs: e.score_us,
        scoreThem: e.score_them,
        recurrenceRule: e.recurrence_rule,
        reminderOffsetsMinutes: [],
        deletedAt: e.deleted_at,
        occurrenceDate: occ.occurrenceDate,
        rsvpCounts: counts,
        myRsvp: myRsvp ? { status: myRsvp.status, note: myRsvp.note } : null,
        playbookName: pb?.name ?? "Playbook",
        playbookColor: pb?.color ?? null,
      });
    }
  }
  rows.sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  return { ok: true, events: rows.slice(0, 50) };
}

export type CoachablePlaybookRow = {
  id: string;
  name: string;
  color: string | null;
};

export async function listMyCoachablePlaybooksAction(): Promise<
  Ok<{ playbooks: CoachablePlaybookRow[] }> | Err
> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data: memberships, error: memErr } = await supabase
    .from("playbook_members")
    .select("playbook_id, role, status")
    .eq("user_id", gate.userId);
  if (memErr) return { ok: false, error: memErr.message };

  const ids = (memberships ?? [])
    .filter(
      (m) =>
        m.status === "active" &&
        (m.role === "owner" || m.role === "editor"),
    )
    .map((m) => m.playbook_id as string);
  if (ids.length === 0) return { ok: true, playbooks: [] };

  const { data, error } = await supabase
    .from("playbooks")
    .select("id, name, color, is_default, is_archived")
    .in("id", ids)
    .eq("is_default", false)
    .eq("is_archived", false)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    playbooks: (data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      color: (p.color as string | null) ?? null,
    })),
  };
}

export type CalendarAttendeeRow = {
  userId: string;
  fullName: string | null;
  status: "yes" | "no" | "maybe" | "no_response";
  note: string | null;
};

export async function listEventAttendeesAction(
  eventId: string,
): Promise<Ok<{ attendees: CalendarAttendeeRow[] }> | Err> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { data: ev } = await admin
    .from("playbook_events")
    .select("playbook_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return { ok: false, error: "Event not found." };
  if (!(await isMemberOf(ev.playbook_id))) {
    return { ok: false, error: "No access to this event." };
  }

  const [membersRes, rsvpsRes] = await Promise.all([
    admin
      .from("playbook_members")
      .select("user_id, profiles!inner(display_name)")
      .eq("playbook_id", ev.playbook_id),
    admin
      .from("playbook_event_rsvps")
      .select("user_id, status, note")
      .eq("event_id", eventId),
  ]);

  type MemberRow = { user_id: string; profiles: { display_name: string | null } };
  type RsvpRow = {
    user_id: string;
    status: "yes" | "no" | "maybe";
    note: string | null;
  };
  const members = (membersRes.data ?? []) as unknown as MemberRow[];
  const rsvps = (rsvpsRes.data ?? []) as RsvpRow[];
  const byUser = new Map(rsvps.map((r) => [r.user_id, r]));

  const attendees: CalendarAttendeeRow[] = members.map((m) => {
    const r = byUser.get(m.user_id);
    return {
      userId: m.user_id,
      fullName: m.profiles?.display_name ?? null,
      status: r?.status ?? "no_response",
      note: r?.note ?? null,
    };
  });

  return { ok: true, attendees };
}

