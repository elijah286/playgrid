"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasLeagueAccess } from "@/lib/league/access";
import { getMyLeagues } from "@/lib/league/console";
import {
  capabilitiesForRole,
  isCapability,
  type AccessScope,
  type Capability,
} from "@/lib/league/access-control";

export type GrantInput = {
  email: string;
  role: string;
  capabilities: string[];
  scope: AccessScope;
};

export type AccessGrantRow = {
  id: string;
  email: string;
  role: string;
  capabilities: Capability[];
  scope: AccessScope;
  status: string;
};

export type AccessLeague = {
  id: string;
  name: string;
  sport: string;
  location: string | null;
  groupIds: string[];
};

export type AccessOverview = {
  grants: AccessGrantRow[];
  leagues: AccessLeague[];
  groups: { id: string; name: string }[];
};

async function gate() {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (!(await hasLeagueAccess())) return { ok: false as const, error: "Not a league operator." };
  return { ok: true as const, supabase, userId: user.id };
}

type GrantDbRow = {
  scope_kind: string;
  scope_leagues: string[] | null;
  scope_sport: string | null;
  scope_group_id: string | null;
};

function scopeFromRow(r: GrantDbRow): AccessScope {
  switch (r.scope_kind) {
    case "leagues":
      return { kind: "leagues", leagueIds: r.scope_leagues ?? [] };
    case "sport":
      return { kind: "sport", sport: r.scope_sport ?? "" };
    case "group":
      return { kind: "group", groupId: r.scope_group_id ?? "" };
    default:
      return { kind: "portfolio" };
  }
}

function scopeToColumns(scope: AccessScope) {
  return {
    scope_kind: scope.kind,
    scope_leagues: scope.kind === "leagues" ? scope.leagueIds : [],
    scope_sport: scope.kind === "sport" ? scope.sport : null,
    scope_group_id: scope.kind === "group" ? scope.groupId : null,
  };
}

export async function listAccessGrantsAction(): Promise<
  { ok: true; data: AccessOverview } | { ok: false; error: string }
> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();

  const myLeagues = await getMyLeagues();
  const leagueIds = myLeagues.map((l) => l.id);

  let leagues: AccessLeague[] = [];
  let groups: { id: string; name: string }[] = [];
  if (leagueIds.length > 0) {
    const [{ data: lgs }, { data: gms }, { data: grps }] = await Promise.all([
      admin.from("leagues").select("id, name, sport, settings").in("id", leagueIds),
      admin.from("league_group_members").select("group_id, league_id").in("league_id", leagueIds),
      admin.from("league_groups").select("id, name").eq("owner_id", g.userId),
    ]);
    const groupsByLeague = new Map<string, string[]>();
    for (const m of gms ?? []) {
      const a = groupsByLeague.get(m.league_id as string) ?? [];
      a.push(m.group_id as string);
      groupsByLeague.set(m.league_id as string, a);
    }
    leagues = (lgs ?? []).map((l) => ({
      id: l.id as string,
      name: l.name as string,
      sport: l.sport as string,
      location: ((l.settings ?? {}) as { location?: string }).location ?? null,
      groupIds: groupsByLeague.get(l.id as string) ?? [],
    }));
    groups = (grps ?? []).map((x) => ({ id: x.id as string, name: x.name as string }));
  }

  const { data: grantRows } = await g.supabase
    .from("league_access_grants")
    .select("id, member_email, role, capabilities, scope_kind, scope_leagues, scope_sport, scope_group_id, status")
    .eq("owner_id", g.userId)
    .order("created_at", { ascending: true });

  const grants: AccessGrantRow[] = (grantRows ?? []).map((r) => ({
    id: r.id as string,
    email: r.member_email as string,
    role: (r.role as string) ?? "custom",
    capabilities: ((r.capabilities as string[]) ?? []).filter(isCapability),
    scope: scopeFromRow(r as GrantDbRow),
    status: (r.status as string) ?? "active",
  }));

  return { ok: true, data: { grants, leagues, groups } };
}

export async function upsertAccessGrantAction(input: GrantInput) {
  const g = await gate();
  if (!g.ok) return g;
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false as const, error: "Enter a valid email." };

  // Source of truth is the capability list: a known preset resolves to its
  // bundle; "custom" keeps the operator's validated selection.
  const caps =
    input.role && input.role !== "custom"
      ? capabilitiesForRole(input.role)
      : (input.capabilities ?? []).filter(isCapability);

  const { error } = await g.supabase.from("league_access_grants").upsert(
    {
      owner_id: g.userId,
      member_email: email,
      role: input.role || "custom",
      capabilities: caps,
      ...scopeToColumns(input.scope),
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,member_email" },
  );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league/people");
  return { ok: true as const };
}

export async function revokeAccessGrantAction(id: string) {
  const g = await gate();
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("league_access_grants")
    .delete()
    .eq("id", id)
    .eq("owner_id", g.userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league/people");
  return { ok: true as const };
}
