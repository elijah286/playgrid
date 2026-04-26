"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

export type AdminUserRowData = {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin" | "coach";
  createdAt: string;
  lastSignIn: string | null;
  tier: SubscriptionTier;
  entitlementSource: "comp" | "stripe" | "free";
  entitlementExpiresAt: string | null;
  compGrantId: string | null;
  subscriptionId: string | null;
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

export async function listUsersForAdminAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error, users: [] };

  const admin = createServiceRoleClient();
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  if (authErr) return { ok: false as const, error: authErr.message, users: [] };

  const [{ data: profiles }, { data: entitlements }] = await Promise.all([
    admin.from("profiles").select("id, display_name, role, created_at"),
    admin
      .from("user_entitlements")
      .select("user_id, tier, source, expires_at, comp_grant_id, subscription_id"),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const entMap = new Map((entitlements ?? []).map((e) => [e.user_id, e]));

  const users: AdminUserRowData[] = (authData.users ?? []).map((u) => {
    const pr = profileMap.get(u.id);
    const e = entMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: pr?.display_name ?? null,
      role: (pr?.role as "user" | "admin" | "coach") ?? "user",
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
      tier: (e?.tier as SubscriptionTier) ?? "free",
      entitlementSource: (e?.source as "comp" | "stripe" | "free") ?? "free",
      entitlementExpiresAt: (e?.expires_at as string | null) ?? null,
      compGrantId: (e?.comp_grant_id as string | null) ?? null,
      subscriptionId: (e?.subscription_id as string | null) ?? null,
    };
  });

  return { ok: true as const, users };
}

export async function createUserAsAdminAction(input: {
  email: string;
  password: string;
  role: "user" | "admin" | "coach";
  displayName?: string;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: "Invalid email." };
  }
  if (input.password.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters." };
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (error) return { ok: false as const, error: error.message };
  if (!data.user) return { ok: false as const, error: "No user returned." };

  const profilePatch: Record<string, string | null> = { role: input.role };
  const displayName = input.displayName?.trim();
  if (displayName) profilePatch.display_name = displayName;

  const { error: upErr } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", data.user.id);
  if (upErr) return { ok: false as const, error: upErr.message };

  revalidateTag(`user-role:${data.user.id}`, "max");
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateUserRoleAction(userId: string, role: "user" | "admin" | "coach") {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (userId === gate.userId && role !== "admin") {
    return { ok: false as const, error: "You cannot remove your own admin role." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false as const, error: error.message };

  revalidateTag(`user-role:${userId}`, "max");
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function updateUserAsAdminAction(input: {
  userId: string;
  email?: string;
  displayName?: string | null;
  role?: "user" | "admin" | "coach";
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();

  const email = input.email?.trim();
  if (email !== undefined && email.length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false as const, error: "Invalid email." };
    }
    const { error } = await admin.auth.admin.updateUserById(input.userId, { email });
    if (error) return { ok: false as const, error: error.message };
  }

  const profilePatch: Record<string, string | null> = {};
  if (input.displayName !== undefined) {
    const trimmed = (input.displayName ?? "").trim();
    profilePatch.display_name = trimmed.length > 0 ? trimmed : null;
  }
  if (input.role !== undefined) {
    if (input.userId === gate.userId && input.role !== "admin") {
      return { ok: false as const, error: "You cannot remove your own admin role." };
    }
    profilePatch.role = input.role;
  }
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from("profiles").update(profilePatch).eq("id", input.userId);
    if (error) return { ok: false as const, error: error.message };
    if (profilePatch.role) {
      revalidateTag(`user-role:${input.userId}`, "max");
    }
  }

  revalidatePath("/settings");
  return { ok: true as const };
}

export async function setUserPasswordAsAdminAction(input: {
  userId: string;
  password: string;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (input.password.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters." };
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.password,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export type AdminUserStats = {
  playbooksOwned: number;
  playbooksShared: number;
  playsCreated: number;
  peopleSharedWith: number;
  totalSecondsOnSite: number;
  lastActiveAt: string | null;
  signupAt: string | null;
  firstPlayAt: string | null;
  activeDaysLast30: number;
  invitesSent: number;
  invitesAccepted: number;
  tierHistory: Array<{
    source: "comp" | "stripe";
    tier: "free" | "coach" | "coach_ai";
    startedAt: string;
    endedAt: string | null;
    note: string | null;
  }>;
};

export async function getAdminUserStatsAction(
  userId: string,
): Promise<
  { ok: true; stats: AdminUserStats } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();

  const { data: ownedRows, error: ownedErr } = await admin
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownedErr) return { ok: false, error: ownedErr.message };
  const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id as string);

  let playbooksShared = 0;
  const peopleSet = new Set<string>();
  if (ownedIds.length > 0) {
    const { data: otherMembers, error: othersErr } = await admin
      .from("playbook_members")
      .select("playbook_id, user_id")
      .in("playbook_id", ownedIds)
      .neq("user_id", userId)
      .eq("status", "active");
    if (othersErr) return { ok: false, error: othersErr.message };
    const sharedBookSet = new Set<string>();
    for (const m of otherMembers ?? []) {
      sharedBookSet.add(m.playbook_id as string);
      peopleSet.add(m.user_id as string);
    }
    playbooksShared = sharedBookSet.size;
  }

  const { data: versionRows, error: versionsErr } = await admin
    .from("play_versions")
    .select("play_id")
    .eq("created_by", userId);
  if (versionsErr) return { ok: false, error: versionsErr.message };
  const playsCreated = new Set(
    (versionRows ?? []).map((r) => r.play_id as string),
  ).size;

  const { data: profileRow } = await admin
    .from("profiles")
    .select("total_seconds_on_site, last_active_at")
    .eq("id", userId)
    .maybeSingle();

  // Signup + first-play
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const signupAt = authUser?.user?.created_at ?? null;
  const { data: firstPlayRow } = await admin
    .from("play_versions")
    .select("created_at")
    .eq("created_by", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const firstPlayAt = (firstPlayRow?.created_at as string | null) ?? null;

  // Distinct active days in the last 30
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data: activityRows } = await admin
    .from("user_activity_days")
    .select("day")
    .eq("user_id", userId)
    .gte("day", thirtyDaysAgo);
  const activeDaysLast30 = (activityRows ?? []).length;

  // Invites sent + accepted (any invite with uses_count > 0 counts as accepted)
  const { data: inviteRows } = await admin
    .from("playbook_invites")
    .select("uses_count, revoked_at")
    .eq("created_by", userId);
  const invitesSent = (inviteRows ?? []).length;
  const invitesAccepted = (inviteRows ?? []).reduce(
    (n, r) => n + (Number(r.uses_count ?? 0) > 0 ? 1 : 0),
    0,
  );

  // Tier history — chronological comp_grants + subscriptions
  const [{ data: compRows }, { data: subRows }] = await Promise.all([
    admin
      .from("comp_grants")
      .select("tier, granted_at, expires_at, revoked_at, note")
      .eq("user_id", userId)
      .order("granted_at", { ascending: true }),
    admin
      .from("subscriptions")
      .select("tier, created_at, updated_at, current_period_end, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);
  const tierHistory: AdminUserStats["tierHistory"] = [];
  for (const g of compRows ?? []) {
    tierHistory.push({
      source: "comp",
      tier: g.tier as "coach" | "coach_ai",
      startedAt: g.granted_at as string,
      endedAt:
        (g.revoked_at as string | null) ??
        (g.expires_at as string | null) ??
        null,
      note: (g.note as string | null) ?? null,
    });
  }
  for (const s of subRows ?? []) {
    const status = s.status as string;
    const ended =
      status === "canceled" ||
      status === "incomplete_expired" ||
      status === "unpaid";
    tierHistory.push({
      source: "stripe",
      tier: s.tier as "coach" | "coach_ai",
      startedAt: s.created_at as string,
      endedAt: ended
        ? ((s.updated_at as string | null) ??
          (s.current_period_end as string | null) ??
          null)
        : null,
      note: status,
    });
  }
  tierHistory.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return {
    ok: true,
    stats: {
      playbooksOwned: ownedIds.length,
      playbooksShared,
      playsCreated,
      peopleSharedWith: peopleSet.size,
      totalSecondsOnSite: Number(profileRow?.total_seconds_on_site ?? 0),
      lastActiveAt: (profileRow?.last_active_at as string | null) ?? null,
      signupAt,
      firstPlayAt,
      activeDaysLast30,
      invitesSent,
      invitesAccepted,
      tierHistory,
    },
  };
}

export type AdminUserActivity = {
  acquisition: {
    firstSeenAt: string | null;
    landingPath: string | null;
    referrer: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    device: string | null;
  } | null;
  signupSource: {
    kind:
      | "coach_invite"
      | "playbook_invite"
      | "home"
      | "shared_playbook"
      | "direct"
      | "other"
      | "unknown";
    label: string;
    detail: string | null;
    invitedByEmail: string | null;
    playbookName: string | null;
  };
  sessions: Array<{
    deviceLabel: string | null;
    approxLocation: string | null;
    createdAt: string;
    lastSeenAt: string;
    revokedAt: string | null;
    revokedReason: string | null;
  }>;
  topPaths: Array<{ path: string; views: number }>;
  recentViews: Array<{
    createdAt: string;
    path: string;
    device: string | null;
    country: string | null;
  }>;
  totalsLast30: {
    pageViews: number;
    distinctSessions: number;
    avgSessionMinutes: number | null;
  };
};

export async function getAdminUserActivityAction(
  userId: string,
): Promise<
  { ok: true; activity: AdminUserActivity } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const thirtyDaysAgoIso = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: firstView },
    { data: sessionRows },
    { data: pageViewRows },
    { data: recentViewRows },
    { data: coachInviteRow },
    { data: nonOwnerMemberships },
  ] = await Promise.all([
    admin
      .from("page_views")
      .select(
        "created_at, path, referrer, utm_source, utm_medium, utm_campaign, country, region, city, device",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("user_sessions")
      .select(
        "device_label, approx_location, created_at, last_seen_at, revoked_at, revoked_reason",
      )
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(8),
    admin
      .from("page_views")
      .select("path, session_id, created_at")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgoIso),
    admin
      .from("page_views")
      .select("created_at, path, device, country")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("coach_invitations")
      .select("created_by, redeemed_at")
      .eq("redeemed_by", userId)
      .order("redeemed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("playbook_members")
      .select("playbook_id, role, created_at")
      .eq("user_id", userId)
      .neq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  const pathCounts = new Map<string, number>();
  const sessionStarts = new Map<string, { first: number; last: number }>();
  for (const r of pageViewRows ?? []) {
    const p = r.path as string;
    pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
    const sid = r.session_id as string;
    const t = new Date(r.created_at as string).getTime();
    const cur = sessionStarts.get(sid);
    if (!cur) sessionStarts.set(sid, { first: t, last: t });
    else {
      if (t < cur.first) cur.first = t;
      if (t > cur.last) cur.last = t;
    }
  }
  const topPaths = [...pathCounts.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  let coachInviterEmail: string | null = null;
  if (coachInviteRow?.created_by) {
    const { data: u } = await admin.auth.admin.getUserById(
      coachInviteRow.created_by as string,
    );
    coachInviterEmail = u?.user?.email ?? null;
  }

  let firstPlaybookName: string | null = null;
  let firstPlaybookOwnerEmail: string | null = null;
  const firstMembership = (nonOwnerMemberships ?? [])[0];
  if (firstMembership) {
    const { data: pb } = await admin
      .from("playbooks")
      .select("name")
      .eq("id", firstMembership.playbook_id as string)
      .maybeSingle();
    firstPlaybookName = (pb?.name as string | null) ?? null;
    const { data: ownerRow } = await admin
      .from("playbook_members")
      .select("user_id")
      .eq("playbook_id", firstMembership.playbook_id as string)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (ownerRow?.user_id) {
      const { data: ownerUser } = await admin.auth.admin.getUserById(
        ownerRow.user_id as string,
      );
      firstPlaybookOwnerEmail = ownerUser?.user?.email ?? null;
    }
  }

  const landingPath = (firstView?.path as string | null) ?? null;
  const referrer = (firstView?.referrer as string | null) ?? null;

  let signupSource: AdminUserActivity["signupSource"];
  if (coachInviteRow) {
    signupSource = {
      kind: "coach_invite",
      label: "Coach invite code",
      detail: coachInviterEmail
        ? `Redeemed code from ${coachInviterEmail}`
        : "Redeemed a coach invite code",
      invitedByEmail: coachInviterEmail,
      playbookName: null,
    };
  } else if (landingPath && landingPath.startsWith("/invite/")) {
    signupSource = {
      kind: "playbook_invite",
      label: "Playbook invite link",
      detail: firstPlaybookName
        ? `Invited to "${firstPlaybookName}"${firstPlaybookOwnerEmail ? ` by ${firstPlaybookOwnerEmail}` : ""}`
        : "Landed on a playbook invite link",
      invitedByEmail: firstPlaybookOwnerEmail,
      playbookName: firstPlaybookName,
    };
  } else if (firstMembership && !landingPath) {
    signupSource = {
      kind: "playbook_invite",
      label: "Joined a playbook",
      detail: firstPlaybookName
        ? `Member of "${firstPlaybookName}"${firstPlaybookOwnerEmail ? ` (owner ${firstPlaybookOwnerEmail})` : ""}`
        : null,
      invitedByEmail: firstPlaybookOwnerEmail,
      playbookName: firstPlaybookName,
    };
  } else if (landingPath === "/" || landingPath === "/home") {
    signupSource = {
      kind: "home",
      label: "Home page",
      detail: referrer ? `via ${referrer}` : "Direct visit",
      invitedByEmail: null,
      playbookName: null,
    };
  } else if (landingPath && landingPath.startsWith("/playbook/")) {
    signupSource = {
      kind: "shared_playbook",
      label: "Shared playbook link",
      detail: `Landed on ${landingPath}`,
      invitedByEmail: null,
      playbookName: null,
    };
  } else if (landingPath) {
    signupSource = {
      kind: "other",
      label: "Other landing page",
      detail: landingPath,
      invitedByEmail: null,
      playbookName: null,
    };
  } else {
    signupSource = {
      kind: "unknown",
      label: "Unknown",
      detail: "No page-view data captured",
      invitedByEmail: null,
      playbookName: null,
    };
  }

  const distinctSessions = sessionStarts.size;
  let avgSessionMinutes: number | null = null;
  if (distinctSessions > 0) {
    let totalMs = 0;
    for (const v of sessionStarts.values()) totalMs += v.last - v.first;
    avgSessionMinutes = Math.round(totalMs / distinctSessions / 60000);
  }

  return {
    ok: true,
    activity: {
      acquisition: firstView
        ? {
            firstSeenAt: (firstView.created_at as string) ?? null,
            landingPath: (firstView.path as string) ?? null,
            referrer: (firstView.referrer as string | null) ?? null,
            utmSource: (firstView.utm_source as string | null) ?? null,
            utmMedium: (firstView.utm_medium as string | null) ?? null,
            utmCampaign: (firstView.utm_campaign as string | null) ?? null,
            country: (firstView.country as string | null) ?? null,
            region: (firstView.region as string | null) ?? null,
            city: (firstView.city as string | null) ?? null,
            device: (firstView.device as string | null) ?? null,
          }
        : null,
      signupSource,
      sessions: (sessionRows ?? []).map((s) => ({
        deviceLabel: (s.device_label as string | null) ?? null,
        approxLocation: (s.approx_location as string | null) ?? null,
        createdAt: s.created_at as string,
        lastSeenAt: s.last_seen_at as string,
        revokedAt: (s.revoked_at as string | null) ?? null,
        revokedReason: (s.revoked_reason as string | null) ?? null,
      })),
      topPaths,
      recentViews: (recentViewRows ?? []).map((r) => ({
        createdAt: r.created_at as string,
        path: r.path as string,
        device: (r.device as string | null) ?? null,
        country: (r.country as string | null) ?? null,
      })),
      totalsLast30: {
        pageViews: (pageViewRows ?? []).length,
        distinctSessions,
        avgSessionMinutes,
      },
    },
  };
}

export async function deleteUserAsAdminAction(userId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (userId === gate.userId) {
    return { ok: false as const, error: "You cannot delete your own account." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true as const };
}
