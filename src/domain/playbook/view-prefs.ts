// Keep this shape explicit — it's the "filters_snapshot" payload we
// persist, and callers upstream (share, invite create, invite accept)
// all need to hand it around. Anything not listed here is session-only
// (e.g. search text).
export type PlaybookViewPrefs = {
  tab?: "plays" | "formations" | "roster" | "games" | "calendar" | "practice_plans";
  view?: "active" | "archived";
  typeFilter?: "all" | "offense" | "defense" | "special_teams";
  groupBy?: "type" | "formation" | "group" | "none";
  viewMode?: "cards" | "list";
  thumbSize?: "small" | "medium" | "large";
  showPlayNumbers?: boolean;
};

/**
 * Strip content-hiding filters from prefs before seeding them to a new
 * member. `typeFilter` and `view` aren't preferences — they're transient
 * filters that hide plays. If a coach was filtered to Offense when they
 * created an invite, we don't want the invitee to land on a playbook
 * where defense and special-teams plays appear to be missing. Layout
 * prefs (groupBy, viewMode, thumbSize, showPlayNumbers, tab) carry over.
 */
export function sanitizeSharedPrefs(
  prefs: PlaybookViewPrefs | null | undefined,
): PlaybookViewPrefs {
  if (!prefs) return {};
  const { typeFilter: _typeFilter, view: _view, ...rest } = prefs;
  void _typeFilter;
  void _view;
  return rest;
}
