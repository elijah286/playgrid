import type { SupabaseClient } from "@supabase/supabase-js";

// Recipient resolution for league announcements. Today's broadcasts only reach
// coaches; families register and give us their email, so we can target them.
// Shared by the send action and Leo's send_announcement tool.

export type BroadcastAudienceKind = "everyone" | "families" | "coaches" | "team";

export type BroadcastAudience = {
  kind: BroadcastAudienceKind;
  /** required when kind === "team" */
  teamId?: string;
};

// A registration counts as a reachable "family" unless it was rejected or
// withdrawn (those families are out of the league pipeline).
const ACTIVE_REG_STATUSES = new Set(["submitted", "approved", "waitlisted", "rostered"]);

type RegRow = { applicant: unknown; status: string; team_id?: string | null };

function guardianEmail(applicant: unknown): string | null {
  const a = (applicant ?? {}) as { guardian?: { email?: unknown } };
  const e = typeof a.guardian?.email === "string" ? a.guardian.email.trim().toLowerCase() : "";
  return e || null;
}

/** Pure: distinct guardian emails from active registrations, optionally scoped
 *  to one team. Exported for testing. */
export function familyEmailsFromRegistrations(rows: RegRow[], teamId?: string): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (!ACTIVE_REG_STATUSES.has(r.status)) continue;
    if (teamId && r.team_id !== teamId) continue;
    const e = guardianEmail(r.applicant);
    if (e) out.add(e);
  }
  return [...out];
}

export function audienceLabel(audience: BroadcastAudience, teamName?: string | null): string {
  switch (audience.kind) {
    case "everyone":
      return "Everyone";
    case "families":
      return "All families";
    case "coaches":
      return "Coaches";
    case "team":
      return `Team: ${teamName ?? "team"}`;
    default:
      return "Recipients";
  }
}

/** Resolve the distinct email recipients for an audience, within a league. */
export async function resolveBroadcastRecipients(
  client: SupabaseClient,
  leagueId: string,
  audience: BroadcastAudience,
): Promise<string[]> {
  const emails = new Set<string>();
  const wantFamilies = audience.kind !== "coaches";
  const wantCoaches = audience.kind !== "families";

  if (wantFamilies) {
    const { data } = await client
      .from("player_registrations")
      .select("applicant, status, team_id")
      .eq("league_id", leagueId)
      .limit(10000);
    const teamScope = audience.kind === "team" ? audience.teamId : undefined;
    for (const e of familyEmailsFromRegistrations((data ?? []) as RegRow[], teamScope)) {
      emails.add(e);
    }
  }

  if (wantCoaches) {
    let q = client.from("teams").select("id, head_coach_email").eq("league_id", leagueId);
    if (audience.kind === "team" && audience.teamId) q = q.eq("id", audience.teamId);
    const { data } = await q;
    for (const t of data ?? []) {
      const e = (t.head_coach_email as string | null)?.trim().toLowerCase();
      if (e) emails.add(e);
    }
  }

  return [...emails];
}
