"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { can } from "@/lib/league/authorize";
import { copyPlaybookContents } from "@/lib/data/playbook-copy";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import { sendCoachPlaybookInvite } from "@/lib/notifications/coach-playbook-email";
import type { SportVariant } from "@/domain/play/types";
import {
  SEEDABLE_VARIANTS,
  type DistributeScope,
  type LeagueTeamPlaybook,
  type PlaybookDistributionRow,
} from "@/lib/league/playbooks";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

// All data access runs via the service role AFTER the isLeagueAdmin gate (the
// gate is the authorization). This (a) works for co-league_admins who don't own
// the team's org, and (b) keeps seeded playbooks OUT of the operator's personal
// coach playbook membership/quota — they're org-owned league assets, accessed
// by the operator via org-ownership RLS, never as a coach playbook_member.

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
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
    .select("sport, name")
    .eq("id", leagueId)
    .maybeSingle();
  if (!leagueHasPlaybooks((league?.sport as string | null) ?? null)) {
    return { ok: false as const, error: "Playbooks aren't available for this sport." };
  }
  return {
    ok: true as const,
    userId: user.id,
    admin,
    leagueName: (league?.name as string) ?? "Your league",
  };
}

/** Seed one team a starter playbook if it doesn't already have one. Idempotent —
 *  a team that already has a non-archived playbook returns it unchanged, so
 *  calling this repeatedly (a re-seed, or re-running a batch) never duplicates. */
async function seedOneTeam(
  admin: AdminClient,
  userId: string,
  teamId: string,
  teamName: string,
  variant: SportVariant,
): Promise<{ ok: true; playbook: LeagueTeamPlaybook } | { ok: false; error: string }> {
  const { data: existing } = await admin
    .from("playbooks")
    .select("id, name")
    .eq("team_id", teamId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return { ok: true, playbook: { id: existing.id as string, name: existing.name as string } };
  }

  // Deterministic example pick (oldest = canonical) for the format.
  const { data: example } = await admin
    .from("playbooks")
    .select("id")
    .eq("is_public_example", true)
    .eq("sport_variant", variant)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!example?.id) {
    return { ok: false, error: "No starter template for that format yet." };
  }

  const settings = defaultSettingsForVariant(variant, null);
  const name = `${teamName} Playbook`;
  const { data: newBook, error } = await admin
    .from("playbooks")
    .insert({ team_id: teamId, name, sport_variant: variant, settings })
    .select("id")
    .single();
  if (error || !newBook) {
    return { ok: false, error: error?.message ?? "Could not create the playbook." };
  }

  // Copy the example's plays + formations. On failure, delete the orphaned
  // playbook (children cascade) so a retry is clean.
  try {
    await copyPlaybookContents(admin, example.id as string, newBook.id as string, userId);
  } catch (e) {
    await admin.from("playbooks").delete().eq("id", newBook.id as string);
    return { ok: false, error: e instanceof Error ? e.message : "Could not copy starter plays." };
  }

  return { ok: true, playbook: { id: newBook.id as string, name } };
}

/** Mint a fresh copy link for a playbook and email it to a coach. Also serves
 *  as "resend" — each call mints a new link, so an earlier unclaimed one still
 *  works too (links don't get revoked by a resend). */
async function sendOneCoachCopy(
  admin: AdminClient,
  userId: string,
  playbookId: string,
  teamName: string,
  coachEmail: string,
  leagueName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: linkErr } = await admin.from("playbook_copy_links").insert({
    playbook_id: playbookId,
    token,
    expires_at: expiresAt,
    created_by: userId,
    copy_game_results: false,
    max_uses: null,
  });
  if (linkErr) return { ok: false, error: linkErr.message };

  const res = await sendCoachPlaybookInvite({
    to: coachEmail,
    leagueName,
    teamName,
    claimUrl: `${SITE_URL}/copy/${token}`,
  });
  if (!res.sent) return { ok: false, error: res.error ?? "Could not send the email." };
  return { ok: true };
}

/** Per-team playbook + distribution status — the source for the Playbooks
 *  page's status board. sendStatus reads from playbook_copy_links.uses_count
 *  (>0 = the coach has redeemed a copy into their own account). */
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
  const { data: links } =
    playbookIds.length > 0
      ? await admin.from("playbook_copy_links").select("playbook_id, uses_count, created_at").in("playbook_id", playbookIds)
      : { data: [] };
  const linkInfoByPlaybook = new Map<string, { claimed: boolean; lastSentAt: string }>();
  for (const l of links ?? []) {
    const pid = l.playbook_id as string;
    const claimed = (l.uses_count as number) > 0;
    const createdAt = l.created_at as string;
    const cur = linkInfoByPlaybook.get(pid);
    linkInfoByPlaybook.set(pid, {
      claimed: (cur?.claimed ?? false) || claimed,
      lastSentAt: !cur || createdAt > cur.lastSentAt ? createdAt : cur.lastSentAt,
    });
  }

  const rows: PlaybookDistributionRow[] = allTeams.map((t) => {
    const teamId = t.id as string;
    const playbook = playbookByTeam.get(teamId) ?? null;
    const link = playbook ? linkInfoByPlaybook.get(playbook.id) : undefined;
    const sendStatus: PlaybookDistributionRow["sendStatus"] = !playbook
      ? "no_playbook"
      : !link
        ? "not_sent"
        : link.claimed
          ? "claimed"
          : "sent";
    return {
      teamId,
      teamName: t.name as string,
      headCoachEmail: (t.head_coach_email as string | null) ?? null,
      playbook,
      sendStatus,
      lastSentAt: link?.lastSentAt ?? null,
    };
  });

  return { ok: true as const, rows };
}

/** Seed (and optionally email) every team in scope in one pass. A coach whose
 *  team already has an outstanding invite is never re-emailed by a batch run —
 *  only teams with zero copy-link history get one, so re-running this to catch
 *  stragglers never spams a coach who's already been invited. Use the per-team
 *  resend for that instead. */
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
  const { data: existingLinks } =
    seededPlaybookIds.length > 0
      ? await admin.from("playbook_copy_links").select("playbook_id").in("playbook_id", seededPlaybookIds)
      : { data: [] };
  const alreadySentPlaybookIds = new Set((existingLinks ?? []).map((l) => l.playbook_id as string));

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
      const sendR = await sendOneCoachCopy(admin, userId, r.playbook.id, teamName, coachEmail, leagueName);
      if (sendR.ok) emailed += 1;
      else errors.push(`${teamName}: ${sendR.error}`);
    }
  }

  revalidatePath(`/league/${leagueId}/playbooks`);
  return { ok: true as const, seeded, emailed, skippedNoEmail, errors, total: targetTeams.length };
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

/** Mint a copy link for a seeded playbook and email it to the team's head coach
 *  — the explicit per-team "send"/"resend" action. */
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

  const res = await sendOneCoachCopy(
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
