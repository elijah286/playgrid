import type { SupabaseClient } from "@supabase/supabase-js";

import { sendLeagueBroadcast } from "@/lib/notifications/league-broadcast-email";
import {
  audienceLabel,
  resolveBroadcastRecipients,
  type BroadcastAudience,
} from "@/lib/league/broadcast-recipients";

/**
 * Core cross-league send, shared by the portfolio action and Leo's
 * send_group_announcement tool so they can't drift. Resolves recipients for the
 * audience across every league in the group, sends ONE deduped email blast (from
 * the group name), and records the announcement in each league's history.
 *
 * The caller resolves the group + its leagueIds (and authorizes the operator);
 * `client` may be the operator session or the service role.
 */
export async function sendGroupBroadcast(
  client: SupabaseClient,
  opts: {
    groupName: string;
    leagueIds: string[];
    audience: BroadcastAudience;
    title: string;
    body: string;
    userId: string;
  },
): Promise<{ ok: true; sent: number; leagues: number } | { ok: false; error: string }> {
  if (opts.leagueIds.length === 0) return { ok: false, error: "Add leagues to this group first." };

  const all = new Set<string>();
  const perLeague: { leagueId: string; count: number }[] = [];
  for (const lid of opts.leagueIds) {
    const recips = await resolveBroadcastRecipients(client, lid, opts.audience);
    recips.forEach((e) => all.add(e));
    perLeague.push({ leagueId: lid, count: recips.length });
  }
  if (all.size === 0) return { ok: false, error: "No recipients across these leagues yet." };

  const res = await sendLeagueBroadcast({
    recipients: [...all],
    leagueName: opts.groupName,
    title: opts.title,
    body: opts.body,
  });
  if (res.error) return { ok: false, error: res.error };

  const label = `Group: ${opts.groupName} · ${audienceLabel(opts.audience)}`;
  const nowIso = new Date().toISOString();
  for (const pl of perLeague) {
    if (pl.count === 0) continue;
    await client.from("league_broadcasts").insert({
      league_id: pl.leagueId,
      audience: label,
      title: opts.title,
      body: opts.body,
      recipient_count: pl.count,
      sent_at: nowIso,
      created_by: opts.userId,
    });
  }

  return { ok: true, sent: res.sent, leagues: opts.leagueIds.length };
}
