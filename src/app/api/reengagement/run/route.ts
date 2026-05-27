import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  sendReengagementEmail,
  startedOnLabel,
  REENGAGEMENT_OPT_OUT_CATEGORY,
  type ReengagementKind,
} from "@/lib/notifications/reengagement-email";
import { buildRecommendations } from "@/lib/notifications/reengagement-recs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

/**
 * Re-engagement nudge cron — recommended cadence: every hour at :15.
 *
 * Sends up to two emails per stalled-1-play user:
 *   3d  — 3-6 days after last activity, one play still on the board
 *   10d — 10+ days after last activity (final nudge)
 *
 * Idempotency: `reengagement_sends` has UNIQUE(user_id, kind), so a
 * duplicate insert errors and the user gets exactly one of each. We
 * insert AFTER Resend confirms — a send failure doesn't burn the slot.
 *
 * Gate: `site_settings.reengagement_enabled` defaults false. The cron
 * route runs regardless (so Cloud Scheduler doesn't drift) but no-ops
 * until you flip the toggle. Test-send script bypasses this entirely.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(req: Request): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 503 });
  }
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : auth.trim();
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();

  // Kill-switch check. While `reengagement_enabled` is false we report
  // ok with zero counts so the cron tick is observable in logs without
  // actually emailing anyone.
  const { data: settings } = await admin
    .from("site_settings")
    .select("reengagement_enabled")
    .eq("id", "default")
    .maybeSingle();
  const enabled = (settings as { reengagement_enabled?: boolean } | null)?.reengagement_enabled === true;
  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, processed: 0, sent: 0 });
  }

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoff3d = new Date(now.getTime() - 3 * dayMs);
  const cutoff10d = new Date(now.getTime() - 10 * dayMs);
  const window3dFloor = new Date(now.getTime() - 10 * dayMs); // 3d sends fire in [10d, 3d] inactivity
  const window10dFloor = new Date(now.getTime() - 90 * dayMs); // don't chase dead leads forever

  // 1) Pull all candidate owners — anyone whose profile is older than
  //    3 days, last_active_at is within the chase window, and who has
  //    a non-empty email. We filter the rest in memory; this set is
  //    small for the foreseeable future.
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, display_name, created_at, last_active_at")
    .lt("created_at", cutoff3d.toISOString())
    .gt("last_active_at", window10dFloor.toISOString());
  if (profErr) {
    return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
  }
  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, enabled: true, processed: 0, sent: 0 });
  }

  const userIds = profiles.map((p) => p.id as string);

  // 2) Owned playbooks via organizations.owner_id → teams.org_id → playbooks.team_id.
  //    Only non-archived playbooks count.
  const [orgsRes, teamsRes, pbsRes, sendsRes, optOutsRes] = await Promise.all([
    admin.from("organizations").select("id, owner_id").in("owner_id", userIds),
    admin.from("teams").select("id, org_id"),
    admin.from("playbooks").select("id, team_id, sport_variant, name, is_archived").eq("is_archived", false),
    admin
      .from("reengagement_sends")
      .select("user_id, kind")
      .in("user_id", userIds),
    admin
      .from("email_opt_outs")
      .select("user_id")
      .eq("category", REENGAGEMENT_OPT_OUT_CATEGORY)
      .in("user_id", userIds),
  ]);
  if (orgsRes.error || teamsRes.error || pbsRes.error || sendsRes.error || optOutsRes.error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          orgsRes.error?.message ??
          teamsRes.error?.message ??
          pbsRes.error?.message ??
          sendsRes.error?.message ??
          optOutsRes.error?.message,
      },
      { status: 500 },
    );
  }
  const optedOut = new Set<string>(
    ((optOutsRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );

  type OrgRow = { id: string; owner_id: string };
  type TeamRow = { id: string; org_id: string };
  type PbRow = { id: string; team_id: string; sport_variant: string | null; name: string };
  type SendRow = { user_id: string; kind: ReengagementKind };

  const ownerByOrg = new Map<string, string>();
  for (const o of (orgsRes.data ?? []) as OrgRow[]) ownerByOrg.set(o.id, o.owner_id);
  const orgByTeam = new Map<string, string>();
  for (const t of (teamsRes.data ?? []) as TeamRow[]) orgByTeam.set(t.id, t.org_id);
  type PbWithOwner = PbRow & { owner_id: string };
  const pbByOwner = new Map<string, PbWithOwner[]>();
  for (const p of (pbsRes.data ?? []) as PbRow[]) {
    const org = orgByTeam.get(p.team_id);
    if (!org) continue;
    const owner = ownerByOrg.get(org);
    if (!owner) continue;
    const list = pbByOwner.get(owner) ?? [];
    list.push({ ...p, owner_id: owner });
    pbByOwner.set(owner, list);
  }
  const sentKinds = new Map<string, Set<ReengagementKind>>();
  for (const s of (sendsRes.data ?? []) as SendRow[]) {
    const set = sentKinds.get(s.user_id) ?? new Set<ReengagementKind>();
    set.add(s.kind);
    sentKinds.set(s.user_id, set);
  }

  // 3) For each candidate owner, count real plays and decide which
  //    nudge (if any) to send.
  type Candidate = {
    userId: string;
    firstName: string | null;
    kind: ReengagementKind;
    playbook: PbWithOwner;
    playName: string | null;
    playConcept: string | null;
    playCreatedAt: Date;
    lastActiveAt: Date;
  };
  const candidates: Candidate[] = [];

  for (const p of profiles) {
    const userId = p.id as string;
    if (optedOut.has(userId)) continue;
    const lastActive = p.last_active_at ? new Date(p.last_active_at) : null;
    if (!lastActive) continue;
    const playbooks = pbByOwner.get(userId) ?? [];
    if (playbooks.length === 0) continue;

    // Decide which nudge slot this user is in. 3d window is [10d, 3d]
    // inclusive; 10d window is older than 10d. Earlier (more recent)
    // wins — we don't fire the 10d before the 3d has had a chance.
    const sent = sentKinds.get(userId) ?? new Set<ReengagementKind>();
    let kind: ReengagementKind | null = null;
    if (lastActive <= cutoff3d && lastActive > cutoff10d && !sent.has("3d")) {
      kind = "3d";
    } else if (lastActive <= cutoff10d && !sent.has("10d") && lastActive > window10dFloor) {
      kind = "10d";
    }
    if (!kind) continue;

    // Find the single owned playbook with exactly 1 real play. If they
    // have multiple playbooks summing to > 1 play, they're past
    // 1-play-stalled — skip.
    let chosen: { pb: PbWithOwner; play: { name: string | null; concept: string | null; created_at: string } } | null = null;
    let totalPlays = 0;
    for (const pb of playbooks) {
      const { data: plays } = await admin
        .from("plays")
        .select("name, concept, created_at, is_archived, is_tutorial, deleted_at")
        .eq("playbook_id", pb.id)
        .eq("is_archived", false)
        .eq("is_tutorial", false)
        .is("deleted_at", null);
      const real = (plays ?? []) as Array<{
        name: string | null;
        concept: string | null;
        created_at: string;
      }>;
      totalPlays += real.length;
      if (real.length === 1 && !chosen) {
        chosen = { pb, play: real[0] };
      }
    }
    if (!chosen || totalPlays !== 1) continue;

    candidates.push({
      userId,
      firstName: firstNameFromDisplay(p.display_name as string | null),
      kind,
      playbook: chosen.pb,
      playName: chosen.play.name,
      playConcept: chosen.play.concept,
      playCreatedAt: new Date(chosen.play.created_at),
      lastActiveAt: lastActive,
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, enabled: true, processed: 0, sent: 0 });
  }

  // 4) Email each candidate. Need their auth.users email (not on profiles).
  let sent = 0;
  const failures: string[] = [];

  for (const c of candidates) {
    const { data: ures } = await admin.auth.admin.getUserById(c.userId);
    const email = ures?.user?.email;
    if (!email) {
      failures.push(`${c.userId}: no email`);
      continue;
    }
    const recs = buildRecommendations({
      sportVariant: c.playbook.sport_variant,
      excludeConcept: c.playConcept,
    });
    if (recs.length === 0) {
      failures.push(`${c.userId}: no recommendations`);
      continue;
    }
    const playbookUrl = `${SITE_URL}/playbooks/${c.playbook.id}`;
    // Send relative to today, since the nudge cadence is anchored on
    // last activity, not play creation. "Started yesterday" is more
    // truthful than "started 3 days ago" if they came back briefly.
    const startedOn = startedOnLabel(c.playCreatedAt, now);

    const res = await sendReengagementEmail({
      toEmail: email,
      userId: c.userId,
      firstName: c.firstName,
      startedOnLabel: startedOn,
      existingPlayName: c.playName,
      playbookUrl,
      recommendations: recs,
      kind: c.kind,
    });

    if (!res.ok) {
      failures.push(`${c.userId}: ${res.error}`);
      continue;
    }
    // Insert AFTER successful send — Resend failure doesn't burn the slot.
    const { error: insErr } = await admin.from("reengagement_sends").insert({
      user_id: c.userId,
      kind: c.kind,
      play_count_at_send: 1,
      sport_variant: c.playbook.sport_variant,
      to_email: email,
    });
    if (insErr) {
      // Possible UNIQUE collision if another concurrent invocation
      // beat us. Log it but treat as a soft success — the email did go.
      failures.push(`${c.userId}: insert failed (${insErr.message})`);
    }
    sent += 1;
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    processed: candidates.length,
    sent,
    failures,
  });
}

function firstNameFromDisplay(name: string | null): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  if (!first) return null;
  // Keep it under 32 chars — defensive against pasted titles.
  return first.slice(0, 32);
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
