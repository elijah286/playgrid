"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getAnalyticsExcludedUserIds } from "@/lib/site/analytics-exclusions-config";
import { CAMPAIGNS, campaignDef } from "@/lib/marketing/campaigns";

export type CampaignMetrics = {
  key: string;
  label: string;
  description: string;
  conversionLabel: string;
  recurring: boolean;
  treatmentSent: number;
  holdout: number;
  failed: number;
  /** null when there's no holdout to compare against. */
  treatmentConvRate: number;
  holdoutConvRate: number | null;
  convLift: number | null;
  treatmentRetRate: number;
  holdoutRetRate: number | null;
  retLift: number | null;
  lastSentAt: string | null;
};

export type MarketingSummary = {
  campaigns: CampaignMetrics[];
  recentSends: Array<{
    campaign: string;
    userLabel: string;
    variant: string;
    status: string;
    sentAt: string;
  }>;
  totals: { touchesLast30: number; overallConvRate: number };
};

async function assertAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { ok: false, error: "Forbidden." };
  return { ok: true };
}

type Send = { userId: string; variant: string; status: string; sentAt: string };

const MS_DAY = 24 * 60 * 60 * 1000;

/** For each user, the timestamps (ms) of their conversion signals. */
async function conversionSignals(
  admin: ReturnType<typeof createServiceRoleClient>,
  campaign: string,
  userIds: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const push = (uid: string, t: string | null) => {
    const ms = t ? Date.parse(t) : NaN;
    if (!Number.isFinite(ms)) return;
    const arr = out.get(uid) ?? [];
    arr.push(ms);
    out.set(uid, arr);
  };
  if (!userIds.length) return out;

  if (campaign === "team_invite_nudge") {
    const { data } = await admin
      .from("playbook_invites")
      .select("created_by, created_at")
      .in("created_by", userIds);
    for (const r of data ?? []) push(r.created_by as string, r.created_at as string);
  } else if (campaign === "referral_launch") {
    const { data: aw } = await admin
      .from("referral_awards")
      .select("sender_id, awarded_at")
      .in("sender_id", userIds);
    for (const r of aw ?? []) push(r.sender_id as string, r.awarded_at as string);
    const { data: ev } = await admin
      .from("ui_events")
      .select("user_id, created_at")
      .eq("event_name", "referral_link_copied")
      .in("user_id", userIds);
    for (const r of ev ?? []) push(r.user_id as string, r.created_at as string);
  } else if (campaign === "reengagement") {
    const { data } = await admin
      .from("user_activity_days")
      .select("user_id, day")
      .in("user_id", userIds);
    for (const r of data ?? []) push(r.user_id as string, `${r.day}T12:00:00Z`);
  }
  return out;
}

/** Retention signal for every campaign: active days (came back). */
async function activityDays(
  admin: ReturnType<typeof createServiceRoleClient>,
  userIds: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!userIds.length) return out;
  const { data } = await admin
    .from("user_activity_days")
    .select("user_id, day")
    .in("user_id", userIds);
  for (const r of data ?? []) {
    const ms = Date.parse(`${r.day}T12:00:00Z`);
    const arr = out.get(r.user_id as string) ?? [];
    arr.push(ms);
    out.set(r.user_id as string, arr);
  }
  return out;
}

function rateWithin(
  users: Array<{ userId: string; sentAt: string }>,
  signals: Map<string, number[]>,
  windowDays: number,
): { count: number; rate: number } {
  if (!users.length) return { count: 0, rate: 0 };
  let converted = 0;
  for (const u of users) {
    const t0 = Date.parse(u.sentAt);
    const hi = t0 + windowDays * MS_DAY;
    const sig = signals.get(u.userId) ?? [];
    if (sig.some((ms) => ms > t0 && ms <= hi)) converted++;
  }
  return { count: converted, rate: converted / users.length };
}

/** Cheap headline number for the admin overview card (sent touches, last 30d). */
export async function getMarketingOverviewAction(): Promise<{ touchesLast30: number }> {
  try {
    const admin = createServiceRoleClient();
    const since = new Date(Date.now() - 30 * MS_DAY).toISOString();
    const [a, b, c] = await Promise.all([
      admin.from("marketing_email_sends").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since),
      admin.from("reengagement_sends").select("id", { count: "exact", head: true }).gte("sent_at", since),
      admin.from("digest_sends").select("id", { count: "exact", head: true }).gte("sent_at", since),
    ]);
    return { touchesLast30: (a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0) };
  } catch {
    return { touchesLast30: 0 };
  }
}

export async function getInviteTeamEmailEnabledAction(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("site_settings")
      .select("invite_team_email_enabled")
      .eq("id", "default")
      .maybeSingle();
    return (data as { invite_team_email_enabled?: boolean } | null)?.invite_team_email_enabled === true;
  } catch {
    return false;
  }
}

export async function setInviteTeamEmailEnabledAction(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert({ id: "default", invite_team_email_enabled: enabled }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getMarketingSummaryAction(): Promise<
  { ok: true; summary: MarketingSummary } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const excluded = await getAnalyticsExcludedUserIds();
    const notExcluded = (uid: string) => !excluded.has(uid);

    // Pull all sends per campaign (unified table + legacy tables, normalized).
    const sendsByCampaign = new Map<string, Send[]>();
    const add = (campaign: string, s: Send) => {
      if (!notExcluded(s.userId)) return;
      const arr = sendsByCampaign.get(campaign) ?? [];
      arr.push(s);
      sendsByCampaign.set(campaign, arr);
    };

    const { data: mkt } = await admin
      .from("marketing_email_sends")
      .select("user_id, campaign, variant, status, sent_at");
    for (const r of mkt ?? [])
      add(r.campaign as string, {
        userId: r.user_id as string,
        variant: r.variant as string,
        status: r.status as string,
        sentAt: r.sent_at as string,
      });

    const { data: reeng } = await admin
      .from("reengagement_sends")
      .select("user_id, sent_at");
    for (const r of reeng ?? [])
      add("reengagement", { userId: r.user_id as string, variant: "treatment", status: "sent", sentAt: r.sent_at as string });

    const { data: dig } = await admin
      .from("digest_sends")
      .select("user_id, sent_at");
    for (const r of dig ?? [])
      add("digest", { userId: r.user_id as string, variant: "treatment", status: "sent", sentAt: r.sent_at as string });

    // Build per-campaign metrics.
    const campaigns: CampaignMetrics[] = [];
    const orderedKeys = [
      ...CAMPAIGNS.map((c) => c.key),
      ...[...sendsByCampaign.keys()].filter((k) => !CAMPAIGNS.some((c) => c.key === k)),
    ];
    for (const key of orderedKeys) {
      const sends = sendsByCampaign.get(key);
      if (!sends || !sends.length) continue;
      const def = campaignDef(key);
      const treatment = sends.filter((s) => s.variant === "treatment" && s.status === "sent");
      const holdoutSends = sends.filter((s) => s.variant === "holdout");
      const failed = sends.filter((s) => s.status === "failed").length;
      const windowDays = def?.conversionWindowDays ?? 14;
      const recurring = def?.recurring ?? false;

      const allUserIds = [...new Set(sends.map((s) => s.userId))];
      const conv = recurring ? new Map<string, number[]>() : await conversionSignals(admin, key, allUserIds);
      const act = await activityDays(admin, allUserIds);

      const tUsers = treatment.map((s) => ({ userId: s.userId, sentAt: s.sentAt }));
      const hUsers = holdoutSends.map((s) => ({ userId: s.userId, sentAt: s.sentAt }));

      const tConv = recurring ? { count: 0, rate: 0 } : rateWithin(tUsers, conv, windowDays);
      const hConv = recurring || !hUsers.length ? null : rateWithin(hUsers, conv, windowDays);
      const tRet = rateWithin(tUsers, act, 14);
      const hRet = hUsers.length ? rateWithin(hUsers, act, 14) : null;

      const lastSentAt =
        sends.reduce<string | null>((max, s) => (!max || s.sentAt > max ? s.sentAt : max), null);

      campaigns.push({
        key,
        label: def?.label ?? key,
        description: def?.description ?? "",
        conversionLabel: def?.conversionLabel ?? "Converted",
        recurring,
        treatmentSent: treatment.length,
        holdout: holdoutSends.length,
        failed,
        treatmentConvRate: tConv.rate,
        holdoutConvRate: hConv ? hConv.rate : null,
        convLift: hConv ? tConv.rate - hConv.rate : null,
        treatmentRetRate: tRet.rate,
        holdoutRetRate: hRet ? hRet.rate : null,
        retLift: hRet ? tRet.rate - hRet.rate : null,
        lastSentAt,
      });
    }

    // Recent sends (labels resolved from profiles/auth).
    const allSends = [...sendsByCampaign.entries()].flatMap(([campaign, list]) =>
      list.map((s) => ({ campaign, ...s })),
    );
    allSends.sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
    const recent = allSends.slice(0, 25);
    const recentIds = [...new Set(recent.map((r) => r.userId))];
    const { data: profs } = recentIds.length
      ? await admin.from("profiles").select("id, display_name").in("id", recentIds)
      : { data: [] as { id: string; display_name: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null]));
    const recentSends = recent.map((r) => ({
      campaign: campaignDef(r.campaign)?.label ?? r.campaign,
      userLabel: nameById.get(r.userId) || `${r.userId.slice(0, 8)}…`,
      variant: r.variant,
      status: r.status,
      sentAt: r.sentAt,
    }));

    // Totals for the overview card (last 30d touches + blended conversion).
    const since = Date.now() - 30 * MS_DAY;
    const touchesLast30 = allSends.filter(
      (s) => s.status === "sent" && Date.parse(s.sentAt) >= since,
    ).length;
    const convNumer = campaigns.reduce((n, c) => n + c.treatmentConvRate * c.treatmentSent, 0);
    const convDenom = campaigns.reduce((n, c) => n + c.treatmentSent, 0);
    const overallConvRate = convDenom > 0 ? convNumer / convDenom : 0;

    return {
      ok: true,
      summary: { campaigns, recentSends, totals: { touchesLast30, overallConvRate } },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load marketing summary." };
  }
}
