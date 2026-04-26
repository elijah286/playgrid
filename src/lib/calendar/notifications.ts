import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";
import type { createServiceRoleClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createServiceRoleClient>;

const DEFAULT_FROM_EMAIL = "xogridmaker <onboarding@resend.dev>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export type CalendarEmailKind = "created" | "edited" | "cancelled" | "reminder";

type EventForEmail = {
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
  notes: string | null;
  opponent: string | null;
  home_away: "home" | "away" | "neutral" | null;
};

function fmtDateTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return new Date(iso).toLocaleString("en-US");
  }
}

function subjectFor(
  kind: CalendarEmailKind,
  ev: EventForEmail,
  playbookName: string,
): string {
  const what = ev.type === "game"
    ? `Game vs ${ev.opponent ?? "TBD"}`
    : ev.type === "scrimmage"
      ? `Scrimmage${ev.opponent ? ` vs ${ev.opponent}` : ""}`
      : ev.title || "Practice";
  switch (kind) {
    case "created":
      return `New on ${playbookName}: ${what}`;
    case "edited":
      return `Updated on ${playbookName}: ${what}`;
    case "cancelled":
      return `Cancelled on ${playbookName}: ${what}`;
    case "reminder":
      return `Reminder: ${what}`;
  }
}

function headlineFor(kind: CalendarEmailKind): string {
  switch (kind) {
    case "created":
      return "A new event was added to your calendar.";
    case "edited":
      return "An event on your calendar was updated.";
    case "cancelled":
      return "An event on your calendar was cancelled.";
    case "reminder":
      return "Heads up — this event is coming up soon.";
  }
}

function buildEmail(
  kind: CalendarEmailKind,
  ev: EventForEmail,
  playbookName: string,
  recipientName: string | null,
): { subject: string; text: string; html: string } {
  const subject = subjectFor(kind, ev, playbookName);
  const headline = headlineFor(kind);
  const when = fmtDateTime(ev.starts_at, ev.timezone);
  const where = ev.location_name
    ? ev.location_address
      ? `${ev.location_name} — ${ev.location_address}`
      : ev.location_name
    : "Location TBD";
  const arrive =
    ev.arrive_minutes_before > 0
      ? `Arrive ${ev.arrive_minutes_before} min early.`
      : null;
  const url = `${SITE_URL}/playbooks/${ev.playbook_id}?tab=calendar`;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  const lines: string[] = [
    greeting,
    "",
    headline,
    "",
    `What: ${ev.title}`,
    `When: ${when}`,
    `Where: ${where}`,
  ];
  if (ev.opponent) lines.push(`Opponent: ${ev.opponent}`);
  if (arrive) lines.push(arrive);
  if (ev.notes) {
    lines.push("");
    lines.push(`Notes: ${ev.notes}`);
  }
  lines.push("");
  lines.push(`Open the calendar: ${url}`);
  const text = lines.join("\n");

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const html = `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5;">
  <p>${esc(greeting)}</p>
  <p>${esc(headline)}</p>
  <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
    <tr><td style="color:#64748b;">What</td><td><strong>${esc(ev.title)}</strong></td></tr>
    <tr><td style="color:#64748b;">When</td><td>${esc(when)}</td></tr>
    <tr><td style="color:#64748b;">Where</td><td>${esc(where)}</td></tr>
    ${ev.opponent ? `<tr><td style="color:#64748b;">Opponent</td><td>${esc(ev.opponent)}</td></tr>` : ""}
    ${arrive ? `<tr><td style="color:#64748b;">Arrive</td><td>${esc(arrive)}</td></tr>` : ""}
  </table>
  ${ev.notes ? `<p style="white-space:pre-wrap;border-left:3px solid #e2e8f0;padding-left:10px;color:#334155;">${esc(ev.notes)}</p>` : ""}
  <p><a href="${url}" style="display:inline-block;background:#0f172a;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;">Open calendar</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px;">Sent from ${esc(playbookName)} on xogridmaker.</p>
</body></html>`;

  return { subject, text, html };
}

/**
 * Send calendar emails to playbook members for a given event/kind.
 * Best-effort: silently no-ops if Resend isn't configured. Excludes the actor.
 */
export async function sendCalendarEventEmails(opts: {
  admin: Admin;
  eventId: string;
  kind: CalendarEmailKind;
  excludeUserId: string | null;
}): Promise<void> {
  const { admin, eventId, kind, excludeUserId } = opts;

  const cfg = await getStoredResendConfig().catch(() => ({
    apiKey: null as string | null,
    fromEmail: null as string | null,
    contactToEmail: null as string | null,
  }));
  const apiKey = cfg.apiKey ?? process.env.RESEND_API_KEY ?? null;
  const fromEmail =
    cfg.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  if (!apiKey) return;

  const { data: ev } = await admin
    .from("playbook_events")
    .select(
      "id, playbook_id, type, title, starts_at, duration_minutes, arrive_minutes_before, timezone, location_name, location_address, notes, opponent, home_away",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return;
  const event = ev as EventForEmail;

  const { data: pb } = await admin
    .from("playbooks")
    .select("name")
    .eq("id", event.playbook_id)
    .maybeSingle();
  const playbookName = (pb?.name as string | undefined) ?? "your playbook";

  const { data: members } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", event.playbook_id);
  const memberIds = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== excludeUserId);
  if (memberIds.length === 0) return;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", memberIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      (p.display_name as string | null) ?? null,
    ]),
  );

  // Parallelize the per-user email lookup. Sequential `await` here was the
  // killer: a team of even 10–15 members stacked enough wall time to push
  // the surrounding server action past Vercel's timeout, so the event saved
  // but the post-action revalidation render came back as a 500 / error.tsx.
  const lookups = await Promise.allSettled(
    memberIds.map((id) => admin.auth.admin.getUserById(id)),
  );
  const recipients: { userId: string; email: string; name: string | null }[] = [];
  lookups.forEach((res, i) => {
    if (res.status !== "fulfilled") return;
    const email = res.value.data?.user?.email ?? null;
    if (!email) return;
    const userId = memberIds[i];
    recipients.push({ userId, email, name: nameById.get(userId) ?? null });
  });
  if (recipients.length === 0) return;

  const resend = new Resend(apiKey);
  await Promise.all(
    recipients.map(async (r) => {
      const { subject, text, html } = buildEmail(
        kind,
        event,
        playbookName,
        r.name,
      );
      try {
        await resend.emails.send({
          from: fromEmail,
          to: r.email,
          subject,
          text,
          html,
        });
      } catch {
        // Best-effort; the in-app notification row was already created.
      }
    }),
  );
}
