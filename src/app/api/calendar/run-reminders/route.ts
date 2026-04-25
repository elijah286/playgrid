import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendCalendarEventEmails } from "@/lib/calendar/notifications";
import { expandRecurrence } from "@/lib/calendar/recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint. For every event with reminder offsets, expand the
// recurrence inside a small forward window, compute each occurrence's
// send-time, and fire any that have come due since the last tick. Dedup is
// keyed by (event_id, occurrence_date, offset_minutes) in
// playbook_event_reminder_fires so duplicate cron ticks are harmless.
//
// Auth: header `Authorization: Bearer <CRON_SECRET>`. Recommended cadence:
// every 5 minutes.

const TICK_LOOKBACK_MS = 15 * 60 * 1000; // tolerate a missed tick or two
const TICK_LOOKAHEAD_MS = 60 * 1000;     // catch reminders firing right now

async function handle(req: Request): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, error: "Server not configured" },
      { status: 503 },
    );
  }
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not set on server" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : auth.trim();
  if (presented !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const admin = createServiceRoleClient();
  const now = Date.now();
  const lower = new Date(now - TICK_LOOKBACK_MS);
  const upper = new Date(now + TICK_LOOKAHEAD_MS);

  // Pull all live events with at least one reminder offset. The bound on
  // starts_at trims old non-recurring events that can't fire again.
  const { data: events, error } = await admin
    .from("playbook_events")
    .select(
      "id, playbook_id, starts_at, recurrence_rule, recurrence_exdate, reminder_offsets_minutes",
    )
    .is("deleted_at", null)
    .or(
      `recurrence_rule.not.is.null,starts_at.gte.${new Date(now - 24 * 60 * 60 * 1000).toISOString()}`,
    );
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  type EventRow = {
    id: string;
    playbook_id: string;
    starts_at: string;
    recurrence_rule: string | null;
    recurrence_exdate: string[] | null;
    reminder_offsets_minutes: number[] | null;
  };

  // Compute candidate fires: an offset N fires if (occStart - N min) is within
  // [lower, upper]. Expand each event's recurrence in a window wide enough to
  // cover (lower + maxOffset, upper + maxOffset).
  type Fire = {
    eventId: string;
    occurrenceDate: string;
    offsetMinutes: number;
  };
  const candidates: Fire[] = [];
  for (const e of (events ?? []) as EventRow[]) {
    const offsets = e.reminder_offsets_minutes ?? [];
    if (offsets.length === 0) continue;
    const maxOffsetMs = Math.max(...offsets) * 60_000;
    const windowStart = new Date(lower.getTime() + 0); // occStart >= lower + 0
    const windowEnd = new Date(upper.getTime() + maxOffsetMs);
    const occurrences = expandRecurrence({
      startsAt: e.starts_at,
      recurrenceRule: e.recurrence_rule,
      exdates: e.recurrence_exdate ?? [],
      windowStart,
      windowEnd,
    });
    for (const occ of occurrences) {
      const occMs = new Date(occ.startsAt).getTime();
      for (const off of offsets) {
        const sendMs = occMs - off * 60_000;
        if (sendMs >= lower.getTime() && sendMs <= upper.getTime()) {
          candidates.push({
            eventId: e.id,
            occurrenceDate: occ.occurrenceDate,
            offsetMinutes: off,
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Filter out already-fired ones via the dedup table.
  const eventIds = Array.from(new Set(candidates.map((c) => c.eventId)));
  const { data: existingFires } = await admin
    .from("playbook_event_reminder_fires")
    .select("event_id, occurrence_date, offset_minutes")
    .in("event_id", eventIds);
  const fired = new Set(
    ((existingFires ?? []) as {
      event_id: string;
      occurrence_date: string;
      offset_minutes: number;
    }[]).map((r) => `${r.event_id}|${r.occurrence_date}|${r.offset_minutes}`),
  );
  const todo = candidates.filter(
    (c) => !fired.has(`${c.eventId}|${c.occurrenceDate}|${c.offsetMinutes}`),
  );
  if (todo.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Group by (eventId, occurrenceDate) so multiple offsets firing in the same
  // tick produce one email — but each (event, occ, offset) still gets its own
  // dedup row.
  const groups = new Map<string, Fire[]>();
  for (const t of todo) {
    const key = `${t.eventId}|${t.occurrenceDate}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  let sentEmails = 0;
  for (const [key, group] of groups.entries()) {
    const [eventId] = key.split("|");
    try {
      await sendCalendarEventEmails({
        admin,
        eventId,
        kind: "reminder",
        excludeUserId: null,
      });
      sentEmails += 1;

      const { data: ev } = await admin
        .from("playbook_events")
        .select("playbook_id")
        .eq("id", eventId)
        .maybeSingle();
      if (ev?.playbook_id) {
        const { data: m } = await admin
          .from("playbook_members")
          .select("user_id")
          .eq("playbook_id", ev.playbook_id);
        const notifRows = (m ?? []).map((row) => ({
          event_id: eventId,
          user_id: row.user_id as string,
          kind: "reminder" as const,
        }));
        if (notifRows.length > 0) {
          await admin.from("playbook_event_notifications").insert(notifRows);
        }
      }
    } catch {
      // best-effort
    } finally {
      await admin
        .from("playbook_event_reminder_fires")
        .insert(
          group.map((g) => ({
            event_id: g.eventId,
            occurrence_date: g.occurrenceDate,
            offset_minutes: g.offsetMinutes,
          })),
        );
    }
  }

  return NextResponse.json({
    ok: true,
    processed: todo.length,
    eventsEmailed: sentEmails,
  });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
