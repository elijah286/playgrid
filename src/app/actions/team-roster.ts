"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type TeamRosterMember = {
  // Stable key for React lists. For team_members rows this is the team_member id;
  // for inferred rows (a profile that has playbook access but no team_members row)
  // this is `inferred:<user_id>`.
  key: string;
  source: "team_member" | "inferred_from_playbook";
  userId: string | null;
  displayName: string | null;
  role: "coach" | "player" | "guest" | "owner" | "editor" | "viewer";
  label: string | null;
  jerseyNumber: string | null;
  position: string | null;
  isMinor: boolean;
  // Playbooks within this team that the user has access to.
  playbooks: { id: string; name: string; role: "owner" | "editor" | "viewer" }[];
};

export type TeamRosterEntry = {
  teamId: string;
  teamName: string;
  members: TeamRosterMember[];
};

export async function listTeamRostersAction() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", teams: [] as TeamRosterEntry[] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", teams: [] };

  await ensureDefaultWorkspace(supabase, user.id);

  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);
  if (orgErr || !orgs?.[0]) {
    return { ok: false as const, error: orgErr?.message ?? "No organization.", teams: [] };
  }
  const orgId = orgs[0].id as string;

  const { data: teams, error: teamErr } = await supabase
    .from("teams")
    .select("id, name")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (teamErr) return { ok: false as const, error: teamErr.message, teams: [] };

  const teamRows = teams ?? [];
  const teamIds = teamRows.map((t) => t.id as string);
  if (teamIds.length === 0) {
    return { ok: true as const, teams: [] as TeamRosterEntry[] };
  }

  const [tmRes, pbRes] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, team_id, user_id, role, label, jersey_number, position, is_minor")
      .in("team_id", teamIds),
    supabase
      .from("playbooks")
      .select("id, name, team_id, is_archived")
      .in("team_id", teamIds),
  ]);
  if (tmRes.error) return { ok: false as const, error: tmRes.error.message, teams: [] };
  if (pbRes.error) return { ok: false as const, error: pbRes.error.message, teams: [] };

  const playbooks = (pbRes.data ?? []).filter((p) => !p.is_archived);
  const playbookIds = playbooks.map((p) => p.id as string);
  const playbookById = new Map(playbooks.map((p) => [p.id as string, p]));

  let memberRows: { playbook_id: string; user_id: string; role: "owner" | "editor" | "viewer" }[] = [];
  if (playbookIds.length > 0) {
    const { data, error } = await supabase
      .from("playbook_members")
      .select("playbook_id, user_id, role")
      .in("playbook_id", playbookIds);
    if (error) return { ok: false as const, error: error.message, teams: [] };
    memberRows = (data ?? []) as typeof memberRows;
  }

  const userIds = new Set<string>();
  (tmRes.data ?? []).forEach((r) => {
    if (r.user_id) userIds.add(r.user_id as string);
  });
  memberRows.forEach((r) => userIds.add(r.user_id));

  let profilesById = new Map<string, { display_name: string | null }>();
  if (userIds.size > 0) {
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", Array.from(userIds));
    if (profErr) return { ok: false as const, error: profErr.message, teams: [] };
    profilesById = new Map(
      (profiles ?? []).map((p) => [p.id as string, { display_name: p.display_name as string | null }]),
    );
  }

  // Build per-team rosters.
  const result: TeamRosterEntry[] = teamRows.map((team) => {
    const teamId = team.id as string;
    const teamMembers = (tmRes.data ?? []).filter((r) => r.team_id === teamId);
    const teamPlaybookMembers = memberRows.filter((m) => {
      const pb = playbookById.get(m.playbook_id);
      return pb && pb.team_id === teamId;
    });

    // Index playbook access by user.
    const accessByUser = new Map<string, TeamRosterMember["playbooks"]>();
    for (const m of teamPlaybookMembers) {
      const pb = playbookById.get(m.playbook_id);
      if (!pb) continue;
      const list = accessByUser.get(m.user_id) ?? [];
      list.push({ id: pb.id as string, name: pb.name as string, role: m.role });
      accessByUser.set(m.user_id, list);
    }

    const seenUsers = new Set<string>();
    const members: TeamRosterMember[] = [];

    for (const tm of teamMembers) {
      const uid = (tm.user_id as string | null) ?? null;
      if (uid) seenUsers.add(uid);
      members.push({
        key: tm.id as string,
        source: "team_member",
        userId: uid,
        displayName: uid ? profilesById.get(uid)?.display_name ?? null : null,
        role: tm.role as TeamRosterMember["role"],
        label: (tm.label as string | null) ?? null,
        jerseyNumber: (tm.jersey_number as string | null) ?? null,
        position: (tm.position as string | null) ?? null,
        isMinor: Boolean(tm.is_minor),
        playbooks: uid ? accessByUser.get(uid) ?? [] : [],
      });
    }

    // Inferred rows: profiles that have playbook access but no team_members row.
    for (const [uid, pbs] of accessByUser.entries()) {
      if (seenUsers.has(uid)) continue;
      // Pick the strongest role across this team's playbooks for display.
      const role = pbs.some((p) => p.role === "owner")
        ? "owner"
        : pbs.some((p) => p.role === "editor")
          ? "editor"
          : "viewer";
      members.push({
        key: `inferred:${uid}`,
        source: "inferred_from_playbook",
        userId: uid,
        displayName: profilesById.get(uid)?.display_name ?? null,
        role,
        label: null,
        jerseyNumber: null,
        position: null,
        isMinor: false,
        playbooks: pbs,
      });
    }

    return { teamId, teamName: team.name as string, members };
  });

  return { ok: true as const, teams: result };
}
