import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getAnalyticsExcludedUserIds } from "@/lib/site/analytics-exclusions-config";
import {
  sendInviteTeamEmail,
  INVITE_TEAM_OPT_OUT_CATEGORY,
} from "@/lib/notifications/invite-team-email";
import { recordMarketingSend, abArm } from "@/lib/marketing/touches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPAIGN = "team_invite_nudge";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";
const MAX_PER_RUN = 150;

export type InviteTeamNudgeResult = {
  enabled: boolean;
  processed: number;
  sent: number;
  holdout: number;
  failed: number;
};

/**
 * Auto-triggered "invite your team" nudge. Targets SOLO coaches who've built a
 * starter playbook (hit the 3rd-play milestone) and then paused for a day — the
 * re-engagement moment. Eligible coaches are split treatment/holdout so the
 * lift is measurable. Idempotent via marketing_email_sends(unique user,campaign).
 *
 * This route exists for manual/isolated triggering (and a dedicated Cloud
 * Scheduler job if ever wanted), but the batch also runs on the re-engagement
 * cron's hourly tick via `runInviteTeamNudge` — so it needs no job of its own.
 * Auth: `Authorization: Bearer $CRON_SECRET`. Gated by
 * site_settings.invite_team_email_enabled (off by default).
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }
  const admin = createServiceRoleClient();
  const result = await runInviteTeamNudge(admin);
  return NextResponse.json({ ok: true, ...result });
}

/**
 * The batch itself — extracted so the re-engagement cron can piggyback on its
 * existing hourly Cloud Scheduler tick (no separate job needed). Independently
 * gated by site_settings.invite_team_email_enabled, so it's safe to call on
 * every tick; it no-ops until the toggle is flipped. Never throws for the
 * common "nothing to do" paths — returns zero counts instead.
 */
export async function runInviteTeamNudge(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<InviteTeamNudgeResult> {
  const { data: settings } = await admin
    .from("site_settings")
    .select("invite_team_email_enabled")
    .eq("id", "default")
    .maybeSingle();
  if ((settings as { invite_team_email_enabled?: boolean } | null)?.invite_team_email_enabled !== true) {
    return { enabled: false, processed: 0, sent: 0, holdout: 0, failed: 0 };
  }

  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff60d = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

  // Candidates: hit the 3rd-play milestone, paused ≥24h ago (but not dead >60d).
  const { data: cands } = await admin
    .from("profiles")
    .select("id, display_name, last_active_at")
    .contains("rating_triggers_fired", ["third_play"])
    .neq("role", "admin")
    .lte("last_active_at", cutoff24h)
    .gte("last_active_at", cutoff60d)
    .limit(2000);
  let candidates = (cands ?? []) as Array<{ id: string; display_name: string | null }>;
  if (!candidates.length) {
    return { enabled: true, processed: 0, sent: 0, holdout: 0, failed: 0 };
  }
  const ids = candidates.map((c) => c.id);

  // Drop already-processed, opted-out, and internal/excluded accounts.
  const [{ data: already }, { data: opts }, excluded] = await Promise.all([
    admin.from("marketing_email_sends").select("user_id").eq("campaign", CAMPAIGN).in("user_id", ids),
    admin.from("email_opt_outs").select("user_id").eq("category", INVITE_TEAM_OPT_OUT_CATEGORY).in("user_id", ids),
    getAnalyticsExcludedUserIds(),
  ]);
  const done = new Set((already ?? []).map((r) => r.user_id as string));
  const optedOut = new Set((opts ?? []).map((r) => r.user_id as string));
  candidates = candidates.filter((c) => !done.has(c.id) && !optedOut.has(c.id) && !excluded.has(c.id));
  if (!candidates.length) {
    return { enabled: true, processed: 0, sent: 0, holdout: 0, failed: 0 };
  }

  // Solo gate: owns ≥1 playbook with NO active non-owner member.
  const remIds = candidates.map((c) => c.id);
  const { data: ownedRows } = await admin
    .from("playbook_members")
    .select("playbook_id, user_id")
    .eq("role", "owner")
    .eq("status", "active")
    .in("user_id", remIds);
  const ownedByUser = new Map<string, string[]>();
  const allPbIds: string[] = [];
  for (const r of ownedRows ?? []) {
    const uid = r.user_id as string;
    const pb = r.playbook_id as string;
    const list = ownedByUser.get(uid) ?? [];
    list.push(pb);
    ownedByUser.set(uid, list);
    allPbIds.push(pb);
  }
  const { data: sharedRows } = allPbIds.length
    ? await admin
        .from("playbook_members")
        .select("playbook_id")
        .in("playbook_id", allPbIds)
        .neq("role", "owner")
        .eq("status", "active")
    : { data: [] as { playbook_id: string }[] };
  const sharedPb = new Set((sharedRows ?? []).map((r) => r.playbook_id as string));

  const solo = candidates.filter((c) => {
    const pbs = ownedByUser.get(c.id) ?? [];
    return pbs.length > 0 && pbs.every((pb) => !sharedPb.has(pb));
  });
  if (!solo.length) {
    return { enabled: true, processed: candidates.length, sent: 0, holdout: 0, failed: 0 };
  }

  // Play counts + a playbook to link to (name), for the treatment email.
  const targets = solo.slice(0, MAX_PER_RUN);
  const linkPbByUser = new Map<string, string>();
  for (const c of targets) linkPbByUser.set(c.id, (ownedByUser.get(c.id) ?? [])[0]);
  const linkPbIds = [...linkPbByUser.values()].filter(Boolean);
  const { data: pbRows } = linkPbIds.length
    ? await admin.from("playbooks").select("id, name").in("id", linkPbIds)
    : { data: [] as { id: string; name: string | null }[] };
  const pbName = new Map((pbRows ?? []).map((r) => [r.id as string, (r.name as string | null) ?? null]));

  let sent = 0, holdout = 0, failed = 0;
  for (const c of targets) {
    const arm = abArm(c.id, CAMPAIGN);
    if (arm === "holdout") {
      await recordMarketingSend(admin, { userId: c.id, campaign: CAMPAIGN, variant: "holdout", status: "holdout" });
      holdout++;
      continue;
    }
    // Treatment — need an email.
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(c.id);
      email = data?.user?.email ?? null;
    } catch {
      email = null;
    }
    const pbId = linkPbByUser.get(c.id);
    if (!email || !pbId) {
      await recordMarketingSend(admin, { userId: c.id, campaign: CAMPAIGN, variant: "treatment", status: "skipped", errorMessage: "no email or playbook" });
      continue;
    }
    const { count: playCount } = await admin
      .from("play_versions")
      .select("id", { count: "exact", head: true })
      .eq("created_by", c.id)
      .eq("kind", "create");
    const res = await sendInviteTeamEmail({
      toEmail: email,
      userId: c.id,
      firstName: c.display_name,
      playbookUrl: `${SITE_URL}/playbooks/${pbId}`,
      playbookName: pbName.get(pbId) ?? null,
      playCount: playCount ?? 3,
    });
    if (res.ok) {
      await recordMarketingSend(admin, { userId: c.id, campaign: CAMPAIGN, variant: "treatment", status: "sent", toEmail: email });
      sent++;
    } else {
      await recordMarketingSend(admin, { userId: c.id, campaign: CAMPAIGN, variant: "treatment", status: "failed", toEmail: email, errorMessage: res.error });
      failed++;
    }
    // Gentle pacing under Resend's rate limit.
    await new Promise((r) => setTimeout(r, 180));
  }

  if (sent || holdout || failed) {
    console.log(
      `[invite-team] nudge ran — processed=${targets.length} sent=${sent} holdout=${holdout} failed=${failed}`,
    );
  }
  return { enabled: true, processed: targets.length, sent, holdout, failed };
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
