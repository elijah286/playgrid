"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";
import { copyPlaybookContents } from "@/lib/data/playbook-copy";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import { sendCoachPlaybookInvite } from "@/lib/notifications/coach-playbook-email";
import type { SportVariant } from "@/domain/play/types";
import {
  SEEDABLE_VARIANTS,
  type LeaguePlaybookTeam,
  type LeagueTeamPlaybook,
} from "@/lib/league/playbooks";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

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
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  // The playbook bridge is football-only — refuse for any other sport (the
  // page hides it, this is defense-in-depth).
  const admin = createServiceRoleClient();
  const { data: league } = await admin
    .from("leagues")
    .select("sport")
    .eq("id", leagueId)
    .maybeSingle();
  if (!leagueHasPlaybooks((league?.sport as string | null) ?? null)) {
    return { ok: false as const, error: "Playbooks aren't available for this sport." };
  }
  return { ok: true as const, userId: user.id, admin };
}

export async function listLeaguePlaybooksAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, teams: [] as LeaguePlaybookTeam[] };
  const { admin } = gate;

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, head_coach_email")
    .eq("league_id", leagueId)
    .order("name", { ascending: true });

  const teamIds = (teams ?? []).map((t) => t.id as string);
  const byTeam = new Map<string, LeagueTeamPlaybook[]>();
  if (teamIds.length > 0) {
    const { data: playbooks } = await admin
      .from("playbooks")
      .select("id, name, team_id")
      .in("team_id", teamIds)
      .eq("is_archived", false);
    for (const p of playbooks ?? []) {
      const key = p.team_id as string;
      const list = byTeam.get(key) ?? [];
      list.push({ id: p.id as string, name: p.name as string });
      byTeam.set(key, list);
    }
  }

  const result: LeaguePlaybookTeam[] = (teams ?? []).map((t) => ({
    teamId: t.id as string,
    teamName: t.name as string,
    headCoachEmail: (t.head_coach_email as string | null) ?? null,
    playbooks: byTeam.get(t.id as string) ?? [],
  }));
  return { ok: true as const, teams: result };
}

export async function seedTeamPlaybookAction(
  leagueId: string,
  teamId: string,
  variant: SportVariant,
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { admin } = gate;
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

  // Idempotency: one seeded playbook per team. A re-seed (double-click) returns
  // the existing one instead of creating a duplicate.
  const { data: existing } = await admin
    .from("playbooks")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return { ok: true as const, playbookId: existing.id as string };
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
    return { ok: false as const, error: "No starter template for that format yet." };
  }

  const settings = defaultSettingsForVariant(variant, null);
  const { data: newBook, error } = await admin
    .from("playbooks")
    .insert({
      team_id: teamId,
      name: `${team.name} Playbook`,
      sport_variant: variant,
      settings,
    })
    .select("id")
    .single();
  if (error || !newBook) {
    return { ok: false as const, error: error?.message ?? "Could not create the playbook." };
  }

  // Copy the example's plays + formations. On failure, delete the orphaned
  // playbook (children cascade) so a retry is clean.
  try {
    await copyPlaybookContents(admin, example.id as string, newBook.id as string, gate.userId);
  } catch (e) {
    await admin.from("playbooks").delete().eq("id", newBook.id as string);
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not copy starter plays.",
    };
  }

  revalidatePath(`/league/${leagueId}/playbooks`);
  return { ok: true as const, playbookId: newBook.id as string };
}

/** Mint a copy link for a seeded playbook and email it to the team's head coach. */
export async function sendCoachPlaybookCopyAction(leagueId: string, playbookId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { admin } = gate;

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

  const { data: league } = await admin
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .maybeSingle();
  const leagueName = (league?.name as string) ?? "Your league";

  // Mint the copy link via service role (the isLeagueAdmin gate is the
  // authorization; this bypasses the coach-product member/tier gate on
  // createCopyLinkAction so a free-tier operator can still hand off playbooks).
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: linkErr } = await admin.from("playbook_copy_links").insert({
    playbook_id: playbookId,
    token,
    expires_at: expiresAt,
    created_by: gate.userId,
    copy_game_results: false,
    max_uses: null,
  });
  if (linkErr) return { ok: false as const, error: linkErr.message };

  const res = await sendCoachPlaybookInvite({
    to: coachEmail,
    leagueName,
    teamName: (team.name as string) ?? "your team",
    claimUrl: `${SITE_URL}/copy/${token}`,
  });
  if (!res.sent) return { ok: false as const, error: res.error ?? "Could not send the email." };
  return { ok: true as const, email: coachEmail };
}
