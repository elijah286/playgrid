"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";
import { gateLeagueCapability, resolveLeagueView } from "@/lib/league/authorize";
import { sendLeagueBroadcast } from "@/lib/notifications/league-broadcast-email";
import { sendPushToUsers } from "@/lib/notifications/push";
import {
  audienceLabel,
  familyEmailsFromRegistrations,
  resolveBroadcastRecipients,
  type BroadcastAudience,
  type BroadcastAudienceKind,
} from "@/lib/league/broadcast-recipients";

export type BroadcastRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  recipientCount: number;
  sentAt: string | null;
  createdAt: string;
};

// Announcements require manage_communications (owners always have it).
function gateAdmin(leagueId: string) {
  return gateLeagueCapability(leagueId, "manage_communications");
}

export type BroadcastAudiences = {
  families: number;
  coaches: number;
  everyone: number;
  teams: { id: string; name: string; count: number }[];
};

function coachEmail(t: { head_coach_email?: unknown }): string | null {
  const e = typeof t.head_coach_email === "string" ? t.head_coach_email.trim().toLowerCase() : "";
  return e || null;
}

/** Reach counts per audience, for the compose-screen selector. */
export async function getBroadcastAudiencesAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, audiences: null };

  const [regsR, teamsR] = await Promise.all([
    gate.supabase
      .from("player_registrations")
      .select("applicant, status, team_id")
      .eq("league_id", leagueId)
      .limit(10000),
    gate.supabase
      .from("teams")
      .select("id, name, head_coach_email")
      .eq("league_id", leagueId)
      .order("name", { ascending: true }),
  ]);
  const regs = (regsR.data ?? []) as { applicant: unknown; status: string; team_id?: string | null }[];
  const teams = teamsR.data ?? [];

  const families = new Set(familyEmailsFromRegistrations(regs));
  const coaches = new Set(teams.map((t) => coachEmail(t)).filter((e): e is string => !!e));
  const everyone = new Set([...families, ...coaches]);
  const teamRows = teams.map((t) => {
    const fam = new Set(familyEmailsFromRegistrations(regs, t.id as string));
    const ce = coachEmail(t);
    if (ce) fam.add(ce);
    return { id: t.id as string, name: t.name as string, count: fam.size };
  });

  const audiences: BroadcastAudiences = {
    families: families.size,
    coaches: coaches.size,
    everyone: everyone.size,
    teams: teamRows,
  };
  return { ok: true as const, audiences };
}

export async function listBroadcastsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as BroadcastRow[] };
  // Grant-aware read: a member reads via RLS; a delegated member with
  // manage_communications reads via the service role.
  const access = await resolveLeagueView(leagueId, {
    delegateCapability: "manage_communications",
  });
  if (!access) return { ok: true as const, items: [] as BroadcastRow[] };
  const supabase = access.db;
  const { data, error } = await supabase
    .from("league_broadcasts")
    .select("id, title, body, audience, recipient_count, sent_at, created_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false as const, error: error.message, items: [] as BroadcastRow[] };
  const items: BroadcastRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    audience: r.audience as string,
    recipientCount: (r.recipient_count as number) ?? 0,
    sentAt: (r.sent_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
  return { ok: true as const, items };
}

export async function sendBroadcastAction(
  leagueId: string,
  input: { title: string; body: string; audience: BroadcastAudienceKind; teamId?: string },
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const t = input.title.trim();
  const b = input.body.trim();
  if (!t) return { ok: false as const, error: "Add a subject." };
  if (!b) return { ok: false as const, error: "Write a message." };
  if (input.audience === "team" && !input.teamId) {
    return { ok: false as const, error: "Pick a team." };
  }
  const audience: BroadcastAudience = { kind: input.audience, teamId: input.teamId };

  const recipients = await resolveBroadcastRecipients(gate.supabase, leagueId, audience);
  if (recipients.length === 0) {
    return { ok: false as const, error: "No one to send to for that audience yet." };
  }

  const { data: league } = await gate.supabase
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .maybeSingle();
  const leagueName = (league?.name as string) ?? "Your league";

  let teamName: string | null = null;
  if (audience.kind === "team" && audience.teamId) {
    const { data: team } = await gate.supabase
      .from("teams")
      .select("name")
      .eq("id", audience.teamId)
      .eq("league_id", leagueId)
      .maybeSingle();
    teamName = (team?.name as string | null) ?? null;
  }

  const res = await sendLeagueBroadcast({ recipients, leagueName, title: t, body: b });
  if (res.error) return { ok: false as const, error: res.error };

  await gate.supabase.from("league_broadcasts").insert({
    league_id: leagueId,
    audience: audienceLabel(audience, teamName),
    title: t,
    body: b,
    recipient_count: res.sent,
    sent_at: new Date().toISOString(),
    created_by: gate.userId,
  });
  revalidatePath(`/league/${leagueId}/communications`);
  return { ok: true as const, sent: res.sent };
}

/**
 * Preview: send the composed announcement to the operator THEMSELVES — by email
 * and as a push to their own devices — so they see exactly what a recipient
 * gets before sending for real. Not recorded in history (it's a test).
 */
export async function sendBroadcastTestAction(
  leagueId: string,
  input: { title: string; body: string },
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const t = input.title.trim();
  const b = input.body.trim();
  if (!t || !b) return { ok: false as const, error: "Add a subject and message first." };

  const auth = await getRequestUser();
  const email = auth.kind === "ok" ? (auth.user?.email ?? null) : null;

  const { data: league } = await gate.supabase
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .maybeSingle();
  const leagueName = (league?.name as string) ?? "Your league";

  let emailed = false;
  if (email) {
    const res = await sendLeagueBroadcast({ recipients: [email], leagueName, title: t, body: b });
    emailed = !res.error && res.sent > 0;
  }

  const admin = createServiceRoleClient();
  const push = await sendPushToUsers({
    admin,
    userIds: [gate.userId],
    category: "team",
    message: { title: `[${leagueName}] ${t}`, body: b, link: `/league/${leagueId}/communications` },
  });

  return {
    ok: true as const,
    email,
    emailed,
    pushDelivered: push.delivered,
    pushConfigured: push.configured,
  };
}
