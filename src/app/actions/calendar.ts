"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendCalendarEventEmails } from "@/lib/calendar/notifications";
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
  await admin.from("playbook_event_notifications").insert(rows);
  await sendCalendarEventEmails({
    admin,
    eventId,
    kind,
    excludeUserId,
  });
}

function buildAutoReminderRows(
  eventId: string,
  startsAt: string,
  offsetsMinutes: number[],
  createdBy: string,
) {
  const start = new Date(startsAt).getTime();
  return offsetsMinutes.map((mins) => ({
    event_id: eventId,
    send_at: new Date(start - mins * 60_000).toISOString(),
    kind: "manual" as const,
    created_by: createdBy,
  }));
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

  if (input.reminderOffsetsMinutes.length > 0) {
    const rows = buildAutoReminderRows(
      inserted.id,
      input.startsAt,
      input.reminderOffsetsMinutes,
      gate.userId,
    );
    await admin.from("playbook_event_reminders").insert(rows);
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

  // Replace any pending auto-reminders to match the new offsets/start time.
  await admin
    .from("playbook_event_reminders")
    .delete()
    .eq("event_id", eventId)
    .is("sent_at", null);
  if (input.reminderOffsetsMinutes.length > 0) {
    const rows = buildAutoReminderRows(
      eventId,
      input.startsAt,
      input.reminderOffsetsMinutes,
      gate.userId,
    );
    await admin.from("playbook_event_reminders").insert(rows);
  }

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
  // For non-recurring events: lock at starts_at. (Recurring events check the
  // occurrence; we trust the client to send the right occurrence_date and
  // simply lock against now when the date is today or earlier — full
  // per-occurrence start-time gating lives with the recurrence work.)
  if (!ev.recurrence_rule) {
    if (new Date(ev.starts_at).getTime() <= Date.now()) {
      return { ok: false, error: "RSVPs are locked once the event has started." };
    }
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

// ─── Listing ──────────────────────────────────────────────────────────────
export type CalendarEventRow = {
  id: string;
  playbookId: string;
  type: "practice" | "game" | "scrimmage";
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
      "id, playbook_id, type, title, starts_at, duration_minutes, arrive_minutes_before, timezone, location_name, location_address, location_lat, location_lng, notes, opponent, home_away, score_us, score_them, recurrence_rule, deleted_at",
    )
    .eq("playbook_id", playbookId)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const eventIds = (events ?? []).map((e) => e.id as string);
  if (eventIds.length === 0) {
    return { ok: true, events: [] };
  }

  const [rsvpsRes, remindersRes] = await Promise.all([
    supabase
      .from("playbook_event_rsvps")
      .select("event_id, user_id, status, note")
      .in("event_id", eventIds),
    supabase
      .from("playbook_event_reminders")
      .select("event_id, send_at")
      .in("event_id", eventIds)
      .is("sent_at", null),
  ]);

  type RsvpRow = {
    event_id: string;
    user_id: string;
    status: "yes" | "no" | "maybe";
    note: string | null;
  };
  type ReminderRow = { event_id: string; send_at: string };
  const rsvps = (rsvpsRes.data ?? []) as RsvpRow[];
  const reminders = (remindersRes.data ?? []) as ReminderRow[];

  type EventRow = {
    id: string;
    playbook_id: string;
    type: "practice" | "game" | "scrimmage";
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
    deleted_at: string | null;
  };

  const rows: CalendarEventRow[] = (events as EventRow[]).map((e) => {
    const myRsvp = rsvps.find(
      (r) => r.event_id === e.id && r.user_id === gate.userId,
    );
    const counts = { yes: 0, no: 0, maybe: 0 };
    for (const r of rsvps) {
      if (r.event_id !== e.id) continue;
      counts[r.status] += 1;
    }
    const startMs = new Date(e.starts_at).getTime();
    const reminderOffsetsMinutes = reminders
      .filter((r) => r.event_id === e.id)
      .map((r) =>
        Math.max(0, Math.round((startMs - new Date(r.send_at).getTime()) / 60000)),
      )
      .sort((a, b) => b - a);
    return {
      id: e.id,
      playbookId: e.playbook_id,
      type: e.type,
      title: e.title,
      startsAt: e.starts_at,
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
      rsvpCounts: counts,
      myRsvp: myRsvp
        ? { status: myRsvp.status, note: myRsvp.note }
        : null,
    };
  });

  return { ok: true, events: rows };
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

