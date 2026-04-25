import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendCalendarEventEmails } from "@/lib/calendar/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint. Picks reminder rows whose send_at has passed and that
// haven't been sent yet, fans out emails, marks them sent. Idempotent —
// `sent_at IS NULL` filter + per-row update means a duplicate cron tick is
// harmless.
//
// Auth: pass header `Authorization: Bearer <CRON_SECRET>`. Any cron service
// works (Supabase pg_cron via pg_net, Railway scheduler, GitHub Actions,
// cron-job.org). Recommended cadence: every 5 minutes.

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
  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("playbook_event_reminders")
    .select("id, event_id")
    .is("sent_at", null)
    .lte("send_at", nowIso)
    .limit(200);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  const rows = (due ?? []) as { id: string; event_id: string }[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Group by event so we don't email the team twice for an event that has
  // both a 24h and a 1h reminder firing in the same tick.
  const byEvent = new Map<string, string[]>();
  for (const r of rows) {
    const ids = byEvent.get(r.event_id) ?? [];
    ids.push(r.id);
    byEvent.set(r.event_id, ids);
  }

  let sent = 0;
  for (const [eventId, ids] of byEvent.entries()) {
    try {
      await sendCalendarEventEmails({
        admin,
        eventId,
        kind: "reminder",
        excludeUserId: null,
      });
      // Also write in-app notification rows so the calendar badge lights up.
      const { data: members } = await admin
        .from("playbook_events")
        .select("playbook_id")
        .eq("id", eventId)
        .maybeSingle();
      if (members?.playbook_id) {
        const { data: m } = await admin
          .from("playbook_members")
          .select("user_id")
          .eq("playbook_id", members.playbook_id);
        const notifRows = (m ?? []).map((row) => ({
          event_id: eventId,
          user_id: row.user_id as string,
          kind: "reminder" as const,
        }));
        if (notifRows.length > 0) {
          await admin.from("playbook_event_notifications").insert(notifRows);
        }
      }
      sent += 1;
    } catch {
      // best-effort
    } finally {
      await admin
        .from("playbook_event_reminders")
        .update({ sent_at: new Date().toISOString() })
        .in("id", ids);
    }
  }

  return NextResponse.json({ ok: true, processed: rows.length, eventsEmailed: sent });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  // Allow GET so cron services that only support GET (e.g. cron-job.org)
  // can trigger the runner the same way.
  return handle(req);
}
