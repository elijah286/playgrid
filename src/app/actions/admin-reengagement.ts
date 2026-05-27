"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

/** Funnel stages, in order. Each is a subset of the previous. */
export type ReengagementFunnel = {
  /** Coaches we emailed. */
  sent: number;
  /** Coaches who clicked at least one tracked link (utm_source=reengagement). */
  clicked: number;
  /** Coaches whose `profiles.last_active_at` is newer than the email's
   *  send_at — i.e. they were active on the site at some point after we
   *  emailed them. Picks up users who clicked AND coaches who came back
   *  via an untagged path (e.g. they remembered the bookmark). */
  returned: number;
  /** Of clickers, those who created at least one new play after the
   *  send_at. The whole point of the nudge. */
  addedPlay: number;
  /** Of clickers, those who started a paid subscription after the
   *  send_at. The ultimate conversion. */
  subscribed: number;
};

export type ReengagementMetrics = {
  overall: ReengagementFunnel;
  /** Split by 3d vs 10d kind so we can see which nudge actually works. */
  byKind: { kind: "3d" | "10d"; funnel: ReengagementFunnel }[];
  /** Most recent N sends with per-recipient outcome flags. */
  recentSends: ReengagementSendRow[];
  /** Total opt-outs from this category. */
  optOuts: number;
  /** Wall-clock time the metrics were computed (server). */
  computedAt: string;
};

export type ReengagementSendRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  kind: "3d" | "10d";
  sportVariant: string | null;
  sentAt: string;
  clicked: boolean;
  /** First click time, or null. Useful for "time-to-click" inspection. */
  firstClickAt: string | null;
  /** Came back to the site at any point after send (page_view OR
   *  play create) — broader than `clicked` because untagged returns
   *  also count. */
  returned: boolean;
  addedPlay: boolean;
  subscribed: boolean;
  optedOut: boolean;
};

async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }
  return { ok: true as const, userId: user.id };
}

/**
 * Pull the re-engagement funnel.
 *
 * Strategy: we have a small enough sends table (low hundreds) that we
 * can fetch every send row and join in memory against:
 *   - page_views.utm_source = 'reengagement' (clicks)
 *   - plays.created_at > sent_at (added play after the nudge)
 *   - subscriptions.created_at > sent_at (converted after the nudge)
 *
 * The "returned" signal is intentionally permissive: it uses
 * profiles.last_active_at > sent_at, which catches both clickers AND
 * coaches who came back via an untagged path (bookmark, push notif,
 * organic-search to the site again, etc.). This way we don't undercount
 * email-influenced returns.
 *
 * Per-kind funnel exists so we can see whether the 3d or 10d nudge is
 * doing more of the lifting. If 3d converts way better than 10d,
 * that's a reason to drop or shorten the 10d.
 */
export async function getReengagementMetricsAction(): Promise<
  | { ok: true; metrics: ReengagementMetrics }
  | { ok: false; error: string }
> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;

  const admin = createServiceRoleClient();

  const [sendsRes, optOutsRes] = await Promise.all([
    admin
      .from("reengagement_sends")
      .select("user_id, kind, sport_variant, sent_at, to_email")
      .order("sent_at", { ascending: false }),
    admin
      .from("email_opt_outs")
      .select("user_id", { count: "exact", head: true })
      .eq("category", "reengagement"),
  ]);
  if (sendsRes.error) return { ok: false, error: sendsRes.error.message };
  const sends = (sendsRes.data ?? []) as Array<{
    user_id: string;
    kind: "3d" | "10d";
    sport_variant: string | null;
    sent_at: string;
    to_email: string | null;
  }>;
  if (sends.length === 0) {
    return {
      ok: true,
      metrics: {
        overall: { sent: 0, clicked: 0, returned: 0, addedPlay: 0, subscribed: 0 },
        byKind: [
          { kind: "3d", funnel: { sent: 0, clicked: 0, returned: 0, addedPlay: 0, subscribed: 0 } },
          { kind: "10d", funnel: { sent: 0, clicked: 0, returned: 0, addedPlay: 0, subscribed: 0 } },
        ],
        recentSends: [],
        optOuts: optOutsRes.count ?? 0,
        computedAt: new Date().toISOString(),
      },
    };
  }

  const userIds = Array.from(new Set(sends.map((s) => s.user_id)));

  // Pull every signal in parallel; filter in memory by send_at per row.
  // page_views and plays can be large in absolute terms, but scoped to
  // <200 user_ids the result set is tiny.
  const [clicksRes, profilesRes, playsRes, subsRes, optRowsRes] = await Promise.all([
    admin
      .from("page_views")
      .select("user_id, created_at, path, utm_campaign, utm_content")
      .eq("utm_source", "reengagement")
      .in("user_id", userIds)
      .order("created_at", { ascending: true }),
    admin
      .from("profiles")
      .select("id, display_name, last_active_at")
      .in("id", userIds),
    admin
      .from("plays")
      .select("playbook_id, created_at")
      .eq("is_archived", false)
      .eq("is_tutorial", false)
      .is("deleted_at", null),
    admin
      .from("subscriptions")
      .select("user_id, created_at, tier, status")
      .in("user_id", userIds),
    admin
      .from("email_opt_outs")
      .select("user_id")
      .eq("category", "reengagement")
      .in("user_id", userIds),
  ]);

  // Need play→owner mapping. Same path as the cron route uses.
  const [orgsRes, teamsRes, pbsRes] = await Promise.all([
    admin.from("organizations").select("id, owner_id").in("owner_id", userIds),
    admin.from("teams").select("id, org_id"),
    admin.from("playbooks").select("id, team_id"),
  ]);

  if (
    clicksRes.error ||
    profilesRes.error ||
    playsRes.error ||
    subsRes.error ||
    optRowsRes.error ||
    orgsRes.error ||
    teamsRes.error ||
    pbsRes.error
  ) {
    return {
      ok: false,
      error:
        clicksRes.error?.message ??
        profilesRes.error?.message ??
        playsRes.error?.message ??
        subsRes.error?.message ??
        optRowsRes.error?.message ??
        orgsRes.error?.message ??
        teamsRes.error?.message ??
        pbsRes.error?.message ??
        "Unknown query failure",
    };
  }

  // Build maps for in-memory join.
  const ownerByOrg = new Map<string, string>();
  for (const o of (orgsRes.data ?? []) as Array<{ id: string; owner_id: string }>) {
    ownerByOrg.set(o.id, o.owner_id);
  }
  const orgByTeam = new Map<string, string>();
  for (const t of (teamsRes.data ?? []) as Array<{ id: string; org_id: string }>) {
    orgByTeam.set(t.id, t.org_id);
  }
  const ownerByPb = new Map<string, string>();
  for (const pb of (pbsRes.data ?? []) as Array<{ id: string; team_id: string }>) {
    const org = orgByTeam.get(pb.team_id);
    if (!org) continue;
    const owner = ownerByOrg.get(org);
    if (!owner) continue;
    ownerByPb.set(pb.id, owner);
  }
  const playsByOwner = new Map<string, string[]>();
  for (const p of (playsRes.data ?? []) as Array<{ playbook_id: string; created_at: string }>) {
    const owner = ownerByPb.get(p.playbook_id);
    if (!owner) continue;
    const list = playsByOwner.get(owner) ?? [];
    list.push(p.created_at);
    playsByOwner.set(owner, list);
  }

  type ClickRow = {
    user_id: string;
    created_at: string;
    utm_campaign: string | null;
  };
  const clicksByUser = new Map<string, ClickRow[]>();
  for (const c of (clicksRes.data ?? []) as ClickRow[]) {
    if (!c.user_id) continue;
    const list = clicksByUser.get(c.user_id) ?? [];
    list.push(c);
    clicksByUser.set(c.user_id, list);
  }
  type ProfileRow = { id: string; display_name: string | null; last_active_at: string | null };
  const profileBy = new Map<string, ProfileRow>();
  for (const p of (profilesRes.data ?? []) as ProfileRow[]) profileBy.set(p.id, p);
  type SubRow = { user_id: string; created_at: string; tier: string; status: string };
  const subsByUser = new Map<string, SubRow[]>();
  for (const s of (subsRes.data ?? []) as SubRow[]) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }
  const optedOut = new Set<string>(
    ((optRowsRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );

  // Per-send outcomes.
  const rows: ReengagementSendRow[] = [];
  for (const s of sends) {
    const userClicks = (clicksByUser.get(s.user_id) ?? []).filter(
      (c) => c.created_at > s.sent_at,
    );
    const userPlays = (playsByOwner.get(s.user_id) ?? []).filter(
      (createdAt) => createdAt > s.sent_at,
    );
    const userSubs = (subsByUser.get(s.user_id) ?? []).filter(
      (sub) => sub.created_at > s.sent_at,
    );
    const profile = profileBy.get(s.user_id);
    const returned = Boolean(
      (profile?.last_active_at && profile.last_active_at > s.sent_at) ||
        userClicks.length > 0 ||
        userPlays.length > 0,
    );
    rows.push({
      userId: s.user_id,
      email: s.to_email,
      displayName: profile?.display_name ?? null,
      kind: s.kind,
      sportVariant: s.sport_variant,
      sentAt: s.sent_at,
      clicked: userClicks.length > 0,
      firstClickAt: userClicks[0]?.created_at ?? null,
      returned,
      addedPlay: userPlays.length > 0,
      subscribed: userSubs.length > 0,
      optedOut: optedOut.has(s.user_id),
    });
  }

  // Aggregate. Each row represents a (user, kind) send — one user may
  // appear in both kinds. We treat each send as its own funnel datapoint.
  function aggregate(rs: ReengagementSendRow[]): ReengagementFunnel {
    return {
      sent: rs.length,
      clicked: rs.filter((r) => r.clicked).length,
      returned: rs.filter((r) => r.returned).length,
      addedPlay: rs.filter((r) => r.addedPlay).length,
      subscribed: rs.filter((r) => r.subscribed).length,
    };
  }

  const overall = aggregate(rows);
  const byKind: { kind: "3d" | "10d"; funnel: ReengagementFunnel }[] = [
    { kind: "3d", funnel: aggregate(rows.filter((r) => r.kind === "3d")) },
    { kind: "10d", funnel: aggregate(rows.filter((r) => r.kind === "10d")) },
  ];

  return {
    ok: true,
    metrics: {
      overall,
      byKind,
      // Cap the table to a reasonable size; ordered desc already from the query.
      recentSends: rows.slice(0, 200),
      optOuts: optOutsRes.count ?? 0,
      computedAt: new Date().toISOString(),
    },
  };
}
