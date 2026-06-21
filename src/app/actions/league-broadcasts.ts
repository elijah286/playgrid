"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";
import { sendLeagueBroadcast } from "@/lib/notifications/league-broadcast-email";

export type BroadcastRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  recipientCount: number;
  sentAt: string | null;
  createdAt: string;
};

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const, supabase, userId: user.id };
}

/** How many coaches currently have an email (the reachable audience today). */
export async function leagueCoachEmailCountAction(leagueId: string): Promise<number> {
  if (!hasSupabaseEnv()) return 0;
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("head_coach_email")
    .eq("league_id", leagueId);
  const emails = new Set(
    (data ?? [])
      .map((t) => (t.head_coach_email as string | null)?.trim().toLowerCase())
      .filter((e): e is string => !!e),
  );
  return emails.size;
}

export async function listBroadcastsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as BroadcastRow[] };
  const supabase = await createClient();
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

export async function sendBroadcastAction(leagueId: string, title: string, body: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const t = title.trim();
  const b = body.trim();
  if (!t) return { ok: false as const, error: "Add a subject." };
  if (!b) return { ok: false as const, error: "Write a message." };

  const { data: teams } = await gate.supabase
    .from("teams")
    .select("head_coach_email")
    .eq("league_id", leagueId);
  const emails = [
    ...new Set(
      (teams ?? [])
        .map((x) => (x.head_coach_email as string | null)?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    ),
  ];
  if (emails.length === 0) {
    return {
      ok: false as const,
      error: "No coaches have an email yet. Add coach emails on the Teams page first.",
    };
  }

  const { data: league } = await gate.supabase
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .maybeSingle();
  const leagueName = (league?.name as string) ?? "Your league";

  const res = await sendLeagueBroadcast({ recipients: emails, leagueName, title: t, body: b });
  if (res.error) return { ok: false as const, error: res.error };

  await gate.supabase.from("league_broadcasts").insert({
    league_id: leagueId,
    audience: "coaches",
    title: t,
    body: b,
    recipient_count: res.sent,
    sent_at: new Date().toISOString(),
    created_by: gate.userId,
  });
  revalidatePath(`/league/${leagueId}/communications`);
  return { ok: true as const, sent: res.sent };
}
