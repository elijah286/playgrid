import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendDigestEmail } from "@/lib/notifications/digest-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily digest cron — recommended cadence: every hour at :00.
 *
 * For each (user, playbook) member combo:
 *   1) Resolve the user's preferences (insert defaults: opted-in, 08:00,
 *      America/Los_Angeles).
 *   2) Skip if opted out.
 *   3) Skip if it's not currently `send_hour_local` in the user's timezone.
 *   4) Skip if a `digest_sends` row already exists for today's local date.
 *   5) Compute activity since the most recent `covered_through` (or 24h ago
 *      if no prior digest exists). If zero, skip — no row written, so the
 *      next non-empty day will pick up the same window.
 *   6) Send the email and write a `digest_sends` row recording the
 *      high-water mark of activity covered.
 *
 * Auth: header `Authorization: Bearer <CRON_SECRET>`.
 */

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
      { ok: false, error: "CRON_SECRET not set" },
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
  const now = new Date();
  const lookbackFloor = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  // Pull all active members + playbook info. Small N for now; we filter
  // by local-hour client-side which is cheap.
  const { data: members, error: memErr } = await admin
    .from("playbook_members")
    .select(
      "user_id, playbook_id, role, playbooks!inner(id, name, is_archived)",
    )
    .eq("status", "active")
    .eq("playbooks.is_archived", false);
  if (memErr) {
    return NextResponse.json(
      { ok: false, error: memErr.message },
      { status: 500 },
    );
  }
  type MemRow = {
    user_id: string;
    playbook_id: string;
    role: "owner" | "editor" | "viewer";
    playbooks:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  };
  const rows = (members ?? []) as unknown as MemRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const playbookIds = Array.from(new Set(rows.map((r) => r.playbook_id)));

  const [prefsRes, sendsRes] = await Promise.all([
    admin
      .from("digest_preferences")
      .select("user_id, playbook_id, opted_out, send_hour_local, timezone")
      .in("user_id", userIds)
      .in("playbook_id", playbookIds),
    admin
      .from("digest_sends")
      .select("user_id, playbook_id, send_date, covered_through")
      .in("user_id", userIds)
      .in("playbook_id", playbookIds)
      .gte("sent_at", lookbackFloor.toISOString()),
  ]);
  type PrefRow = {
    user_id: string;
    playbook_id: string;
    opted_out: boolean;
    send_hour_local: number;
    timezone: string;
  };
  type SendRow = {
    user_id: string;
    playbook_id: string;
    send_date: string;
    covered_through: string;
  };
  const prefs = new Map<string, PrefRow>();
  for (const p of (prefsRes.data ?? []) as PrefRow[]) {
    prefs.set(`${p.user_id}|${p.playbook_id}`, p);
  }
  const lastSends = new Map<string, SendRow>();
  for (const s of (sendsRes.data ?? []) as SendRow[]) {
    const k = `${s.user_id}|${s.playbook_id}`;
    const prev = lastSends.get(k);
    if (!prev || s.covered_through > prev.covered_through) {
      lastSends.set(k, s);
    }
  }

  // Filter to (user, playbook) due now in their local timezone.
  type Due = {
    userId: string;
    playbookId: string;
    playbookName: string;
    sinceIso: string;
    todayLocal: string;
  };
  const due: Due[] = [];
  const DEFAULT_HOUR = 8;
  const DEFAULT_TZ = "America/Los_Angeles";
  for (const r of rows) {
    const pb = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    if (!pb) continue;
    const k = `${r.user_id}|${r.playbook_id}`;
    const pref = prefs.get(k);
    if (pref?.opted_out) continue;
    const tz = pref?.timezone || DEFAULT_TZ;
    const sendHour = pref?.send_hour_local ?? DEFAULT_HOUR;
    const local = localParts(now, tz);
    if (local.hour !== sendHour) continue;
    const last = lastSends.get(k);
    if (last && last.send_date === local.date) continue;
    const sinceIso =
      last?.covered_through ??
      new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    due.push({
      userId: r.user_id,
      playbookId: r.playbook_id,
      playbookName: pb.name,
      sinceIso,
      todayLocal: local.date,
    });
  }
  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Bulk-load activity for each playbook's window. Group dues by playbook
  // to share queries.
  const dueByPlaybook = new Map<string, Due[]>();
  for (const d of due) {
    const list = dueByPlaybook.get(d.playbookId) ?? [];
    list.push(d);
    dueByPlaybook.set(d.playbookId, list);
  }

  type PlayUpdate = {
    play_id: string;
    play_name: string;
    actor: string;
    comment: string | null;
    sent_at: string;
  };
  type Join = {
    user_id: string;
    actor: string;
    role: "owner" | "editor" | "viewer";
    created_at: string;
  };
  const updatesByPb = new Map<string, PlayUpdate[]>();
  const joinsByPb = new Map<string, Join[]>();

  for (const [pbId, list] of dueByPlaybook.entries()) {
    const earliest = list.reduce(
      (acc, d) => (d.sinceIso < acc ? d.sinceIso : acc),
      list[0].sinceIso,
    );
    const [updRes, joinRes] = await Promise.all([
      admin
        .from("play_team_notifications")
        .select(
          "id, sent_at, sent_by, comment, play:play_id!inner(id, document, playbook_id)",
        )
        .eq("play.playbook_id", pbId)
        .gt("sent_at", earliest)
        .order("sent_at", { ascending: false }),
      admin
        .from("playbook_members")
        .select("user_id, role, created_at")
        .eq("playbook_id", pbId)
        .eq("status", "active")
        .gt("created_at", earliest)
        .order("created_at", { ascending: false }),
    ]);
    type RawUpd = {
      id: string;
      sent_at: string;
      sent_by: string;
      comment: string | null;
      play:
        | { id: string; document: unknown; playbook_id: string }
        | { id: string; document: unknown; playbook_id: string }[]
        | null;
    };
    type RawJoin = {
      user_id: string;
      role: "owner" | "editor" | "viewer";
      created_at: string;
    };
    const actorIds = new Set<string>();
    for (const u of (updRes.data ?? []) as RawUpd[]) {
      if (u.sent_by) actorIds.add(u.sent_by);
    }
    for (const j of (joinRes.data ?? []) as RawJoin[]) {
      if (j.user_id) actorIds.add(j.user_id);
    }
    const actorNames = new Map<string, string>();
    if (actorIds.size > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(actorIds));
      for (const p of profs ?? []) {
        const n = (p.display_name as string | null)?.trim();
        if (n) actorNames.set(p.id as string, n);
      }
    }
    const updates: PlayUpdate[] = [];
    for (const u of (updRes.data ?? []) as RawUpd[]) {
      const play = Array.isArray(u.play) ? u.play[0] : u.play;
      if (!play) continue;
      const meta = (play.document as { metadata?: { coachName?: string } } | null)
        ?.metadata;
      updates.push({
        play_id: play.id,
        play_name: meta?.coachName?.trim() || "Untitled play",
        actor: actorNames.get(u.sent_by) ?? "A coach",
        comment: u.comment,
        sent_at: u.sent_at,
      });
    }
    const joins: Join[] = [];
    for (const j of (joinRes.data ?? []) as RawJoin[]) {
      joins.push({
        user_id: j.user_id,
        actor: actorNames.get(j.user_id) ?? "Someone",
        role: j.role,
        created_at: j.created_at,
      });
    }
    updatesByPb.set(pbId, updates);
    joinsByPb.set(pbId, joins);
  }

  let sent = 0;
  let skipped = 0;
  for (const d of due) {
    const updates = (updatesByPb.get(d.playbookId) ?? []).filter(
      (u) => u.sent_at > d.sinceIso,
    );
    const joins = (joinsByPb.get(d.playbookId) ?? []).filter(
      (j) => j.user_id !== d.userId && j.created_at > d.sinceIso,
    );
    if (updates.length === 0 && joins.length === 0) {
      skipped += 1;
      continue;
    }

    const { data: ures } = await admin.auth.admin.getUserById(d.userId);
    const email = ures?.user?.email;
    if (!email) {
      skipped += 1;
      continue;
    }
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", d.userId)
      .maybeSingle();
    const recipientName = (prof?.display_name as string | null) ?? null;

    const ok = await sendDigestEmail({
      toEmail: email,
      recipientName,
      playbookId: d.playbookId,
      playbookName: d.playbookName,
      joins: joins.map((j) => ({ actor: j.actor, role: j.role })),
      playUpdates: updates.map((u) => ({
        playId: u.play_id,
        playName: u.play_name,
        actor: u.actor,
        comment: u.comment,
      })),
    });

    if (!ok) {
      skipped += 1;
      continue;
    }

    const covered =
      [
        ...updates.map((u) => u.sent_at),
        ...joins.map((j) => j.created_at),
      ].sort()[updates.length + joins.length - 1] ?? now.toISOString();
    await admin.from("digest_sends").insert({
      user_id: d.userId,
      playbook_id: d.playbookId,
      send_date: d.todayLocal,
      covered_through: covered,
      joins_count: joins.length,
      play_updates_count: updates.length,
    });
    sent += 1;
  }

  return NextResponse.json({ ok: true, processed: due.length, sent, skipped });
}

function localParts(d: Date, timezone: string): { date: string; hour: number } {
  // Intl.DateTimeFormat is the only stable way to format an arbitrary
  // IANA timezone in Node without pulling in a deps. We extract YYYY-MM-DD
  // and the 24h hour in the target zone.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const day = get("day");
  const h = parseInt(get("hour"), 10);
  return {
    date: `${y}-${m}-${day}`,
    hour: Number.isFinite(h) ? h % 24 : 0,
  };
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
