"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";
import { can } from "@/lib/league/authorize";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import {
  leagueVariantToSportVariant,
  seedOneTeam,
  sendCoachHandoffInvite,
} from "@/lib/league/team-playbook";
import {
  distributePlayGroupToPlaybook,
  distributePracticePlanToPlaybook,
} from "@/lib/league/distribute";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import type { SportVariant } from "@/domain/play/types";
import type { LibraryItem, LibraryItemKind } from "@/lib/league/library";
import {
  SEEDABLE_VARIANTS,
  markStaleDistributions,
  type DistributeScope,
  type PlaybookDistributionRow,
} from "@/lib/league/playbooks";

// All data access runs via the service role AFTER the manage_curriculum gate
// (the gate is the authorization). This (a) works for co-league_admins who
// don't own the team's org, and (b) keeps seeded playbooks OUT of anyone's
// personal coach playbook membership/quota — they're org-owned league assets.
// The coach handoff is an INVITE (membership on the org-owned playbook), not
// a copy link — see src/lib/league/team-playbook.ts and the library plan.

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const auth = await getRequestUser();
  if (auth.kind !== "ok" || !auth.user) return { ok: false as const, error: "Not signed in." };
  const user = auth.user;
  // Owner/admin OR a delegated member holding manage_curriculum (playbooks are
  // the curriculum bridge). Data access still runs via the service role below.
  if (!(await can("manage_curriculum", leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  // The playbook bridge is football-only — refuse for any other sport (the
  // page hides it, this is defense-in-depth).
  const admin = createServiceRoleClient();
  const { data: league } = await admin
    .from("leagues")
    .select("sport, name, created_by, settings")
    .eq("id", leagueId)
    .maybeSingle();
  if (!leagueHasPlaybooks((league?.sport as string | null) ?? null)) {
    return { ok: false as const, error: "Playbooks aren't available for this sport." };
  }
  const settings = (league?.settings ?? {}) as { variant?: string };
  return {
    ok: true as const,
    userId: user.id,
    admin,
    leagueName: (league?.name as string) ?? "Your league",
    operatorId: (league?.created_by as string) ?? user.id,
    leagueVariant: leagueVariantToSportVariant(settings.variant ?? null),
  };
}

type AdminClient = ReturnType<typeof createServiceRoleClient>;

/** Per-team playbook + handoff status + what's been distributed — the source
 *  for the Playbooks page's status board. Claimed = the coach holds an active
 *  membership on the team playbook (invite accepted); legacy copy-link
 *  redemptions still count so pre-invite sends read correctly. */
export async function listPlaybookDistributionAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, rows: [] as PlaybookDistributionRow[] };
  const { admin } = gate;

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, head_coach_email")
    .eq("league_id", leagueId)
    .order("name", { ascending: true });
  const allTeams = teams ?? [];
  const teamIds = allTeams.map((t) => t.id as string);

  const { data: playbooks } =
    teamIds.length > 0
      ? await admin.from("playbooks").select("id, name, team_id").in("team_id", teamIds).eq("is_archived", false)
      : { data: [] };
  const playbookByTeam = new Map(
    (playbooks ?? []).map((p) => [p.team_id as string, { id: p.id as string, name: p.name as string }]),
  );
  const playbookIds = (playbooks ?? []).map((p) => p.id as string);

  const nowIso = new Date().toISOString();
  const [linksRes, invitesRes, membersRes, ledgerRes] = await Promise.all([
    playbookIds.length > 0
      ? admin.from("playbook_copy_links").select("playbook_id, uses_count, created_at").in("playbook_id", playbookIds)
      : Promise.resolve({ data: [] }),
    playbookIds.length > 0
      ? admin
          .from("playbook_invites")
          .select("playbook_id, uses_count, created_at, revoked_at, expires_at")
          .in("playbook_id", playbookIds)
      : Promise.resolve({ data: [] }),
    playbookIds.length > 0
      ? admin
          .from("playbook_members")
          .select("playbook_id, role, status")
          .in("playbook_id", playbookIds)
          .neq("role", "owner")
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? admin
          .from("league_distributions")
          .select("team_id, item_id, title_snapshot, created_at")
          .in("team_id", teamIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const claimedPlaybooks = new Set<string>();
  const sentInfo = new Map<string, string>(); // playbook_id -> latest sent at
  const note = (pid: string, at: string) => {
    const cur = sentInfo.get(pid);
    if (!cur || at > cur) sentInfo.set(pid, at);
  };
  for (const m of membersRes.data ?? []) {
    if ((m.status as string) === "active") claimedPlaybooks.add(m.playbook_id as string);
  }
  for (const l of linksRes.data ?? []) {
    if ((l.uses_count as number) > 0) claimedPlaybooks.add(l.playbook_id as string);
    note(l.playbook_id as string, l.created_at as string);
  }
  for (const i of invitesRes.data ?? []) {
    if ((i.uses_count as number) > 0) claimedPlaybooks.add(i.playbook_id as string);
    if (!i.revoked_at && (i.expires_at as string) > nowIso) note(i.playbook_id as string, i.created_at as string);
  }

  const distByTeam = new Map<string, { itemId: string | null; title: string; at: string }[]>();
  const ledgerItemIds = new Set<string>();
  for (const d of ledgerRes.data ?? []) {
    const itemId = (d.item_id as string | null) ?? null;
    if (itemId) ledgerItemIds.add(itemId);
    const list = distByTeam.get(d.team_id as string) ?? [];
    list.push({ itemId, title: d.title_snapshot as string, at: d.created_at as string });
    distByTeam.set(d.team_id as string, list);
  }

  // When was each distributed library item's SOURCE last edited? A team whose
  // latest copy predates that is a redistribute candidate (Phase 4). Play
  // group → newest source-play edit; practice plan → its updated_at.
  const sourceUpdatedAtByItem = new Map<string, string>();
  if (ledgerItemIds.size > 0) {
    const { data: items } = await admin
      .from("league_library_items")
      .select("id, kind, source_group_id, source_practice_plan_id")
      .in("id", [...ledgerItemIds]);
    const groupItems = (items ?? []).filter((i) => i.source_group_id);
    const planItems = (items ?? []).filter((i) => i.source_practice_plan_id);
    const groupIds = groupItems.map((i) => i.source_group_id as string);
    const planIds = planItems.map((i) => i.source_practice_plan_id as string);
    const [playsRes, plansRes] = await Promise.all([
      groupIds.length > 0
        ? admin
            .from("plays")
            .select("group_id, updated_at")
            .in("group_id", groupIds)
            .eq("is_archived", false)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      planIds.length > 0
        ? admin.from("practice_plans").select("id, updated_at").in("id", planIds)
        : Promise.resolve({ data: [] }),
    ]);
    const newestPlayByGroup = new Map<string, string>();
    for (const pl of playsRes.data ?? []) {
      const g = pl.group_id as string;
      const at = pl.updated_at as string;
      const cur = newestPlayByGroup.get(g);
      if (!cur || at > cur) newestPlayByGroup.set(g, at);
    }
    const planUpdatedById = new Map(
      (plansRes.data ?? []).map((pl) => [pl.id as string, pl.updated_at as string]),
    );
    for (const it of groupItems) {
      const at = newestPlayByGroup.get(it.source_group_id as string);
      if (at) sourceUpdatedAtByItem.set(it.id as string, at);
    }
    for (const it of planItems) {
      const at = planUpdatedById.get(it.source_practice_plan_id as string);
      if (at) sourceUpdatedAtByItem.set(it.id as string, at);
    }
  }

  const rows: PlaybookDistributionRow[] = allTeams.map((t) => {
    const teamId = t.id as string;
    const playbook = playbookByTeam.get(teamId) ?? null;
    const claimed = playbook ? claimedPlaybooks.has(playbook.id) : false;
    const lastSentAt = playbook ? (sentInfo.get(playbook.id) ?? null) : null;
    const sendStatus: PlaybookDistributionRow["sendStatus"] = !playbook
      ? "no_playbook"
      : claimed
        ? "claimed"
        : lastSentAt
          ? "sent"
          : "not_sent";
    return {
      teamId,
      teamName: t.name as string,
      headCoachEmail: (t.head_coach_email as string | null) ?? null,
      playbook,
      sendStatus,
      lastSentAt,
      distributions: markStaleDistributions(distByTeam.get(teamId) ?? [], sourceUpdatedAtByItem),
    };
  });

  return { ok: true as const, rows };
}

/** Seed (and optionally invite) every team in scope in one pass. A coach whose
 *  team already has an outstanding invite or copy link is never re-emailed by
 *  a batch run — use the per-team resend for that instead. */
export async function distributePlaybooksToTeamsAction(
  leagueId: string,
  scope: DistributeScope,
  variant: SportVariant,
  emailCoaches: boolean,
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { admin, userId, leagueName } = gate;
  if (!SEEDABLE_VARIANTS.some((v) => v.value === variant)) {
    return { ok: false as const, error: "Unsupported format." };
  }

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, head_coach_email")
    .eq("league_id", leagueId)
    .order("name", { ascending: true });
  const allTeams = teams ?? [];
  if (allTeams.length === 0) return { ok: false as const, error: "No teams yet." };

  const teamIds = allTeams.map((t) => t.id as string);
  const { data: existingPbs } = await admin
    .from("playbooks")
    .select("id, team_id")
    .in("team_id", teamIds)
    .eq("is_archived", false);
  const playbookIdByTeam = new Map((existingPbs ?? []).map((p) => [p.team_id as string, p.id as string]));

  const targetTeams = Array.isArray(scope)
    ? allTeams.filter((t) => scope.includes(t.id as string))
    : scope === "all"
      ? allTeams
      : allTeams.filter((t) => !playbookIdByTeam.has(t.id as string));
  if (targetTeams.length === 0) return { ok: false as const, error: "No teams match." };

  const seededPlaybookIds = [...playbookIdByTeam.values()];
  const [linksRes, invitesRes] = await Promise.all([
    seededPlaybookIds.length > 0
      ? admin.from("playbook_copy_links").select("playbook_id").in("playbook_id", seededPlaybookIds)
      : Promise.resolve({ data: [] }),
    seededPlaybookIds.length > 0
      ? admin.from("playbook_invites").select("playbook_id").in("playbook_id", seededPlaybookIds)
      : Promise.resolve({ data: [] }),
  ]);
  const alreadySentPlaybookIds = new Set([
    ...(linksRes.data ?? []).map((l) => l.playbook_id as string),
    ...(invitesRes.data ?? []).map((i) => i.playbook_id as string),
  ]);

  let seeded = 0;
  let emailed = 0;
  let skippedNoEmail = 0;
  const errors: string[] = [];

  for (const team of targetTeams) {
    const teamId = team.id as string;
    const teamName = team.name as string;
    const r = await seedOneTeam(admin, userId, teamId, teamName, variant);
    if (!r.ok) {
      errors.push(`${teamName}: ${r.error}`);
      continue;
    }
    seeded += 1;

    if (emailCoaches && !alreadySentPlaybookIds.has(r.playbook.id)) {
      const coachEmail = ((team.head_coach_email as string | null) ?? "").trim();
      if (!coachEmail) {
        skippedNoEmail += 1;
        continue;
      }
      const sendR = await sendCoachHandoffInvite(admin, userId, r.playbook.id, teamName, coachEmail, leagueName);
      if (sendR.ok) emailed += 1;
      else errors.push(`${teamName}: ${sendR.error}`);
    }
  }

  revalidatePath(`/league/${leagueId}/playbooks`);
  return { ok: true as const, seeded, emailed, skippedNoEmail, errors, total: targetTeams.length };
}

function rowToLibraryItem(r: Record<string, unknown>): LibraryItem {
  return {
    id: r.id as string,
    kind: r.kind as LibraryItemKind,
    sourcePlaybookId: r.source_playbook_id as string,
    sourceGroupId: (r.source_group_id as string | null) ?? null,
    sourcePracticePlanId: (r.source_practice_plan_id as string | null) ?? null,
    title: r.title as string,
    sport: r.sport as string,
    variant: r.variant as string,
    tags: (r.tags as string[]) ?? [],
    createdAt: r.created_at as string,
  };
}

/** The league operator's library items — the distributable sources shown in
 *  the batch panel. Owned by the league's OPERATOR (leagues.created_by), so a
 *  delegated curriculum manager distributes from the org's library. */
export async function listDistributableLibraryItemsAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, items: [] as LibraryItem[] };
  const { data } = await gate.admin
    .from("league_library_items")
    .select("*")
    .eq("owner_id", gate.operatorId)
    .order("created_at", { ascending: false });
  return { ok: true as const, items: (data ?? []).map(rowToLibraryItem) };
}

async function ensureTeamPlaybook(
  admin: AdminClient,
  teamId: string,
  teamName: string,
  variant: SportVariant,
): Promise<{ ok: true; playbookId: string } | { ok: false; error: string }> {
  const { data: existing } = await admin
    .from("playbooks")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { ok: true, playbookId: existing.id as string };
  // No playbook yet → create an EMPTY one (no starter plays): the operator is
  // distributing their own content, not the canned starter.
  const { data: created, error } = await admin
    .from("playbooks")
    .insert({
      team_id: teamId,
      name: `${teamName} Playbook`,
      sport_variant: variant,
      settings: defaultSettingsForVariant(variant, null),
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Could not create the playbook." };
  return { ok: true, playbookId: created.id as string };
}

/** Distribute library items into team playbooks — snapshot copies, add-only
 *  (a re-distribution lands as a version-suffixed group; nothing the coach
 *  edited is ever touched). Writes one ledger row per item × team. */
export async function distributeLibraryItemsAction(
  leagueId: string,
  itemIds: string[],
  scope: "all" | string[],
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { admin, userId, operatorId, leagueVariant } = gate;
  if (itemIds.length === 0) return { ok: false as const, error: "Pick something to distribute." };

  const { data: itemRows } = await admin
    .from("league_library_items")
    .select("*")
    .eq("owner_id", operatorId)
    .in("id", itemIds);
  const items = (itemRows ?? []).map(rowToLibraryItem);
  if (items.length === 0) return { ok: false as const, error: "Those library items no longer exist." };

  const { data: teams } = await admin
    .from("teams")
    .select("id, name")
    .eq("league_id", leagueId)
    .order("name", { ascending: true });
  const targets = (teams ?? []).filter((t) => scope === "all" || scope.includes(t.id as string));
  if (targets.length === 0) return { ok: false as const, error: "No teams match." };

  let distributed = 0;
  const errors: string[] = [];
  for (const team of targets) {
    const teamId = team.id as string;
    const teamName = team.name as string;
    const pb = await ensureTeamPlaybook(admin, teamId, teamName, leagueVariant);
    if (!pb.ok) {
      errors.push(`${teamName}: ${pb.error}`);
      continue;
    }
    for (const item of items) {
      const r =
        item.kind === "play_group"
          ? await distributePlayGroupToPlaybook(admin, item, pb.playbookId, userId)
          : await distributePracticePlanToPlaybook(admin, item, pb.playbookId, userId);
      if (!r.ok) {
        errors.push(`${teamName} · ${item.title}: ${r.error}`);
        continue;
      }
      distributed += 1;
      await admin.from("league_distributions").insert({
        owner_id: operatorId,
        item_id: item.id,
        kind: item.kind,
        title_snapshot: item.title,
        league_id: leagueId,
        team_id: teamId,
        target_playbook_id: pb.playbookId,
        target_group_id: item.kind === "play_group" && "groupId" in r ? r.groupId : null,
        distributed_by: userId,
      });
    }
  }

  revalidatePath(`/league/${leagueId}/playbooks`);
  return { ok: true as const, distributed, teams: targets.length, errors };
}

/** Single-team seed — kept for the per-team fallback when a batch skips a team
 *  (unsupported format, missing example) and the operator wants to retry it
 *  alone with a different format. */
export async function seedTeamPlaybookAction(leagueId: string, teamId: string, variant: SportVariant) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { admin, userId } = gate;
  if (!SEEDABLE_VARIANTS.some((v) => v.value === variant)) {
    return { ok: false as const, error: "Unsupported format." };
  }

  const { data: team } = await admin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("league_id", leagueId)
    .maybeSingle();
  if (!team) return { ok: false as const, error: "That team isn't in this league." };

  const r = await seedOneTeam(admin, userId, teamId, team.name as string, variant);
  if (!r.ok) return { ok: false as const, error: r.error };
  revalidatePath(`/league/${leagueId}/playbooks`);
  return { ok: true as const, playbookId: r.playbook.id };
}

/** Invite the team's head coach onto their playbook (or re-send the invite) —
 *  the explicit per-team "send"/"resend" action. */
export async function sendCoachPlaybookCopyAction(leagueId: string, playbookId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { admin, userId, leagueName } = gate;

  const { data: pb } = await admin
    .from("playbooks")
    .select("id, team_id")
    .eq("id", playbookId)
    .maybeSingle();
  if (!pb?.team_id) return { ok: false as const, error: "That playbook no longer exists." };

  const { data: team } = await admin
    .from("teams")
    .select("name, league_id, head_coach_email")
    .eq("id", pb.team_id as string)
    .maybeSingle();
  if (!team || team.league_id !== leagueId) {
    return { ok: false as const, error: "That playbook isn't in this league." };
  }
  const coachEmail = ((team.head_coach_email as string | null) ?? "").trim();
  if (!coachEmail) {
    return {
      ok: false as const,
      error: "No head-coach email on this team — add one on the Teams page.",
    };
  }

  const res = await sendCoachHandoffInvite(
    admin,
    userId,
    playbookId,
    (team.name as string) ?? "your team",
    coachEmail,
    leagueName,
  );
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath(`/league/${leagueId}/playbooks`);
  return { ok: true as const, email: coachEmail };
}
