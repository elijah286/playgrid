import { randomBytes } from "crypto";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { copyPlaybookContents } from "@/lib/data/playbook-copy";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { sendCoachPlaybookInvite } from "@/lib/notifications/coach-playbook-email";
import { ensureSeatsAvailable } from "@/lib/billing/seats";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import { defaultsForNewTeam, libraryItemFromRow } from "@/lib/league/library";
import {
  distributePlayGroupToPlaybook,
  distributePracticePlanToPlaybook,
} from "@/lib/league/distribute";
import type { SportVariant } from "@/domain/play/types";
import type { LeagueTeamPlaybook } from "@/lib/league/playbooks";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

/** League settings.variant ("flag" | "tackle" | "7v7") → the coach product's
 *  SportVariant. New-team seeding derives its format from this. */
export function leagueVariantToSportVariant(leagueVariant: string | null | undefined): SportVariant {
  switch ((leagueVariant ?? "").toLowerCase()) {
    case "tackle":
      return "tackle_11";
    case "flag":
      return "flag_5v5";
    default:
      return "flag_7v7";
  }
}

/** Seed one team a starter playbook if it doesn't already have one. Idempotent —
 *  a team that already has a non-archived playbook returns it unchanged, so
 *  calling this repeatedly (a re-seed, or re-running a batch) never duplicates. */
export async function seedOneTeam(
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

/**
 * The coach handoff (plan decision 2026-07-03): a playbook INVITE, not a copy
 * link. The coach joins the org-owned team playbook as role "editor" — the
 * role the seat system counts (seats.ts) and the invite-accept path puts on
 * the roster. NEVER "owner": ownership stays with the org, which is what
 * keeps the coach's own free-playbook quota untouched (see
 * playbook-create.memberQuota.test.ts) and lets a replacement coach be
 * invited to the same playbook later. Each call mints a fresh single-use,
 * email-bound invite; resending never revokes earlier ones.
 */
export async function sendCoachHandoffInvite(
  admin: AdminClient,
  userId: string,
  playbookId: string,
  teamName: string,
  coachEmail: string,
  leagueName: string,
  operatorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Send-time seat guard, mirroring the coach product's invite flow: don't
  // mint an editor invite the operator has no seat for. The hard enforcement
  // stays at ACCEPT (decision: seat consumed on accept) — a Coach+ invitee
  // still rides free there — this just fails fast at send.
  const seatCheck = await ensureSeatsAvailable(operatorId, 1);
  if (!seatCheck.ok) return { ok: false, error: seatCheck.error };

  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: invErr } = await admin.from("playbook_invites").insert({
    playbook_id: playbookId,
    role: "editor",
    token,
    email: coachEmail,
    max_uses: 1,
    expires_at: expiresAt,
    created_by: userId,
  });
  if (invErr) return { ok: false, error: invErr.message };

  const res = await sendCoachPlaybookInvite({
    to: coachEmail,
    leagueName,
    teamName,
    claimUrl: `${SITE_URL}/invite/${token}`,
  });
  if (!res.sent) return { ok: false, error: res.error ?? "Could not send the email." };
  return { ok: true };
}

/**
 * Team-creation hook (Phase 2): every new team in a playbook-capable league
 * gets its playbook immediately — starter plays for the league's game type,
 * plus whatever library items the operator marked as defaults for that
 * variant (org-wide or for this league), via defaultsForNewTeam. Best-effort
 * by contract: team creation must succeed even if seeding hits a snag, so
 * this returns warnings instead of throwing.
 */
export async function autoSeedNewTeam(
  admin: AdminClient,
  args: { leagueId: string; teamId: string; teamName: string; userId: string },
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const { data: league } = await admin
    .from("leagues")
    .select("sport, created_by, settings")
    .eq("id", args.leagueId)
    .maybeSingle();
  if (!league || !leagueHasPlaybooks((league.sport as string | null) ?? null)) {
    return { warnings };
  }
  const operatorId = league.created_by as string;
  const settings = (league.settings ?? {}) as { variant?: string };
  const variant = leagueVariantToSportVariant(settings.variant ?? null);

  const seeded = await seedOneTeam(admin, args.userId, args.teamId, args.teamName, variant);
  if (!seeded.ok) {
    warnings.push(`Playbook not seeded: ${seeded.error}`);
    return { warnings };
  }

  const [{ data: itemRows }, { data: defaultRows }] = await Promise.all([
    admin.from("league_library_items").select("*").eq("owner_id", operatorId),
    admin.from("league_library_defaults").select("id, item_id, league_id").eq("owner_id", operatorId),
  ]);
  const items = (itemRows ?? []).map(libraryItemFromRow);
  const defaults = (defaultRows ?? []).map((r) => ({
    id: r.id as string,
    itemId: r.item_id as string,
    leagueId: (r.league_id as string | null) ?? null,
  }));

  for (const item of defaultsForNewTeam(items, defaults, args.leagueId, variant)) {
    const r =
      item.kind === "play_group"
        ? await distributePlayGroupToPlaybook(admin, item, seeded.playbook.id, args.userId)
        : await distributePracticePlanToPlaybook(admin, item, seeded.playbook.id, args.userId);
    if (!r.ok) {
      warnings.push(`${item.title}: ${r.error}`);
      continue;
    }
    await admin.from("league_distributions").insert({
      owner_id: operatorId,
      item_id: item.id,
      kind: item.kind,
      title_snapshot: item.title,
      league_id: args.leagueId,
      team_id: args.teamId,
      target_playbook_id: seeded.playbook.id,
      target_group_id: item.kind === "play_group" && "groupId" in r ? r.groupId : null,
      distributed_by: args.userId,
    });
  }
  return { warnings };
}
