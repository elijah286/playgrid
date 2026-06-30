// Delegated-administration model for league operators (Phase 1).
//
// An operator (portfolio owner) grants other people scoped access: a ROLE (a
// bundle of capabilities) at a SCOPE (portfolio / specific leagues / a sport /
// a group). This module is the PURE core — capability catalog, role presets,
// and scope math — shared by the management UI (client) and the `can()` resolver
// (server). No I/O here, so it's fully unit-tested.

/** Atomic write-permissions. Viewing a scope is implicit for any member; these
 *  gate mutations (and financials, which are sensitive even to read). */
export const CAPABILITIES = [
  { key: "manage_registration", label: "Registration", description: "Configure registration, approve or reject players" },
  { key: "manage_rosters", label: "Rosters", description: "Place and move players on teams" },
  { key: "manage_teams", label: "Teams & coaches", description: "Create teams, assign coaches" },
  { key: "manage_schedule", label: "Schedule & scores", description: "Set the schedule and enter scores" },
  { key: "manage_store", label: "Store & merch", description: "Manage merchandise and store items" },
  { key: "manage_communications", label: "Communications", description: "Send announcements" },
  { key: "manage_curriculum", label: "Curriculum", description: "Share practice plans with coaches" },
  { key: "view_financials", label: "Financials", description: "View revenue and payments" },
  { key: "manage_members", label: "Manage members", description: "Invite and manage other members" },
  { key: "manage_settings", label: "League settings", description: "Rename, registration link, archive" },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["key"];

export const ALL_CAPABILITIES: Capability[] = CAPABILITIES.map((c) => c.key);

/** Friendly presets that bundle capabilities. "custom" lets the operator pick. */
export const ROLE_PRESETS: Record<string, { label: string; capabilities: Capability[] }> = {
  admin: { label: "Admin", capabilities: ALL_CAPABILITIES },
  league_manager: {
    label: "League manager",
    capabilities: ALL_CAPABILITIES.filter((c) => c !== "manage_members"),
  },
  registrar: { label: "Registrar", capabilities: ["manage_registration", "manage_rosters"] },
  coach_coordinator: { label: "Coach coordinator", capabilities: ["manage_teams", "manage_rosters"] },
  scorekeeper: { label: "Scorekeeper", capabilities: ["manage_schedule"] },
  merch_manager: { label: "Merch manager", capabilities: ["manage_store"] },
  communications: { label: "Communications", capabilities: ["manage_communications"] },
  viewer: { label: "Viewer", capabilities: [] },
};

export type MemberRole = keyof typeof ROLE_PRESETS | "custom";

export function isCapability(v: unknown): v is Capability {
  return typeof v === "string" && ALL_CAPABILITIES.includes(v as Capability);
}

export function capabilitiesForRole(role: string): Capability[] {
  return ROLE_PRESETS[role]?.capabilities ?? [];
}

/** Best preset whose capability set matches exactly, else "custom". Lets the UI
 *  show "Merch manager" instead of a raw checkbox list when it lines up. */
export function roleForCapabilities(caps: Capability[]): MemberRole {
  const set = new Set(caps);
  for (const [key, preset] of Object.entries(ROLE_PRESETS)) {
    if (preset.capabilities.length === set.size && preset.capabilities.every((c) => set.has(c))) {
      return key as MemberRole;
    }
  }
  return "custom";
}

export type AccessScope =
  | { kind: "portfolio" }
  | { kind: "leagues"; leagueIds: string[] }
  | { kind: "sport"; sport: string }
  | { kind: "group"; groupId: string };

/** Whether a scope covers a given league. The league carries the facts the
 *  attribute scopes need (its sport, and the groups it belongs to). */
export function scopeIncludesLeague(
  scope: AccessScope,
  league: { id: string; sport: string; groupIds: string[] },
): boolean {
  switch (scope.kind) {
    case "portfolio":
      return true;
    case "leagues":
      return scope.leagueIds.includes(league.id);
    case "sport":
      return league.sport === scope.sport;
    case "group":
      return league.groupIds.includes(scope.groupId);
  }
}

/** Rebuild an AccessScope from DB columns (shared by the actions + the resolver). */
export function scopeFromColumns(c: {
  scope_kind: string;
  scope_leagues?: string[] | null;
  scope_sport?: string | null;
  scope_group_id?: string | null;
}): AccessScope {
  switch (c.scope_kind) {
    case "leagues":
      return { kind: "leagues", leagueIds: c.scope_leagues ?? [] };
    case "sport":
      return { kind: "sport", sport: c.scope_sport ?? "" };
    case "group":
      return { kind: "group", groupId: c.scope_group_id ?? "" };
    default:
      return { kind: "portfolio" };
  }
}

/** Do any of these grants confer `capability` on this league? The pure heart of
 *  the `can()` resolver — a grant counts when it includes the capability AND its
 *  scope covers the league. */
export function grantsCover(
  grants: { capabilities: string[]; scope: AccessScope }[],
  capability: Capability,
  league: { id: string; sport: string; groupIds: string[] },
): boolean {
  return grants.some(
    (g) => g.capabilities.includes(capability) && scopeIncludesLeague(g.scope, league),
  );
}

export function scopeLabel(scope: AccessScope, leagueCount?: number): string {
  switch (scope.kind) {
    case "portfolio":
      return "Entire portfolio";
    case "leagues":
      return scope.leagueIds.length === 1
        ? "1 league"
        : `${scope.leagueIds.length} leagues`;
    case "sport":
      return `Sport: ${scope.sport}${leagueCount ? ` · ${leagueCount} leagues` : ""}`;
    case "group":
      return "League group";
  }
}
