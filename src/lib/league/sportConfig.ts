// Per-sport configuration for the league-operator platform. The league schema
// is sport-agnostic (leagues.sport enum); this module is the single place that
// turns a sport into display labels + capability flags.
//
// Scope: operator-side only. The football coach product (playbooks/plays) stays
// football-only — `hasPlaybooks` gates that bridge. Standings ranking is generic
// (W-L-T) for every sport today; sport-correct ranking (soccer table points,
// win%, no-ties enforcement) is a planned fast-follow and will hang off this
// config (see docs/league-platform/MULTI-SPORT.md).

export type LeagueSport =
  | "football"
  | "soccer"
  | "basketball"
  | "baseball"
  | "volleyball"
  | "other";

export type SportConfig = {
  /** Display name. */
  label: string;
  /** Singular noun for a contest: "game" | "match" | "meet". */
  gameNoun: string;
  /** Noun for a side's score: "points" | "goals" | "runs" | "sets". */
  scoreNoun: string;
  /** What a team's leader is called: "coach" | "manager". */
  coachNoun: string;
  /** Football-only: the coach-product playbook bridge is available. */
  hasPlaybooks: boolean;
};

export const SPORT_CONFIG: Record<LeagueSport, SportConfig> = {
  football: { label: "Football", gameNoun: "game", scoreNoun: "points", coachNoun: "coach", hasPlaybooks: true },
  soccer: { label: "Soccer", gameNoun: "match", scoreNoun: "goals", coachNoun: "manager", hasPlaybooks: false },
  basketball: { label: "Basketball", gameNoun: "game", scoreNoun: "points", coachNoun: "coach", hasPlaybooks: false },
  baseball: { label: "Baseball", gameNoun: "game", scoreNoun: "runs", coachNoun: "coach", hasPlaybooks: false },
  volleyball: { label: "Volleyball", gameNoun: "match", scoreNoun: "sets", coachNoun: "coach", hasPlaybooks: false },
  other: { label: "Sport", gameNoun: "game", scoreNoun: "points", coachNoun: "coach", hasPlaybooks: false },
};

/** Sports offered at league creation, in display order. */
export const LEAGUE_SPORTS: { value: LeagueSport; label: string }[] = [
  "football",
  "soccer",
  "basketball",
  "baseball",
  "volleyball",
  "other",
].map((s) => ({ value: s as LeagueSport, label: SPORT_CONFIG[s as LeagueSport].label }));

const SPORT_VALUES = new Set<string>(LEAGUE_SPORTS.map((s) => s.value));

export function isLeagueSport(value: string): value is LeagueSport {
  return SPORT_VALUES.has(value);
}

export function sportConfig(sport: string | null | undefined): SportConfig {
  return (sport && SPORT_CONFIG[sport as LeagueSport]) || SPORT_CONFIG.other;
}

/** Football-only capability gate (the coach-product playbook bridge). */
export function leagueHasPlaybooks(sport: string | null | undefined): boolean {
  return sportConfig(sport).hasPlaybooks;
}
