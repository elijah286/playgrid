/**
 * Client-safe constants for the carried-team selection. Kept free of any
 * server-only imports (e.g. next/headers) so client components can import
 * ALL_TEAMS without dragging server code into the browser bundle. The
 * server-only reader lives in ./selected-team-server.
 */
export const SELECTED_TEAM_COOKIE = "xo_app_team";
export const ALL_TEAMS = "all";
