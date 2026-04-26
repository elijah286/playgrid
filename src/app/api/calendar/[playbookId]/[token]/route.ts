import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { buildIcsFeed, type IcsEvent } from "@/lib/calendar/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  playbook_id: string;
  type: "practice" | "game" | "scrimmage" | "other";
  title: string;
  starts_at: string;
  duration_minutes: number;
  arrive_minutes_before: number;
  location_name: string | null;
  location_address: string | null;
  notes: string | null;
  opponent: string | null;
  home_away: "home" | "away" | "neutral" | null;
  recurrence_rule: string | null;
  updated_at: string | null;
  created_at: string;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ playbookId: string; token: string }> },
) {
  if (!hasSupabaseEnv()) {
    return new NextResponse("Server not configured", { status: 503 });
  }
  const { playbookId, token } = await ctx.params;
  if (!playbookId || !token) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createServiceRoleClient();
  const { data: tok } = await admin
    .from("playbook_calendar_tokens")
    .select("playbook_id, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!tok || tok.revoked_at || tok.playbook_id !== playbookId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [{ data: pb }, { data: events }] = await Promise.all([
    admin.from("playbooks").select("name").eq("id", playbookId).maybeSingle(),
    admin
      .from("playbook_events")
      .select(
        "id, playbook_id, type, title, starts_at, duration_minutes, arrive_minutes_before, location_name, location_address, notes, opponent, home_away, recurrence_rule, updated_at, created_at",
      )
      .eq("playbook_id", playbookId)
      .is("deleted_at", null)
      .order("starts_at", { ascending: true }),
  ]);

  const calendarName = `${(pb?.name as string | undefined) ?? "Playbook"} — Team Calendar`;
  const rows = (events ?? []) as EventRow[];
  const ics = buildIcsFeed({
    calendarName,
    events: rows.map<IcsEvent>((e) => ({
      id: e.id,
      playbookId: e.playbook_id,
      type: e.type,
      title: e.title,
      startsAt: e.starts_at,
      durationMinutes: e.duration_minutes,
      arriveMinutesBefore: e.arrive_minutes_before,
      locationName: e.location_name,
      locationAddress: e.location_address,
      notes: e.notes,
      opponent: e.opponent,
      homeAway: e.home_away,
      recurrenceRule: e.recurrence_rule,
      updatedAt: e.updated_at ?? e.created_at,
    })),
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="team-calendar.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
