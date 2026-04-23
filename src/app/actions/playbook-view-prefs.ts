"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

// Keep this shape explicit — it's the "filters_snapshot" payload we
// persist, and callers upstream (share, invite create, invite accept)
// all need to hand it around. Anything not listed here is session-only
// (e.g. search text).
export type PlaybookViewPrefs = {
  tab?: "plays" | "formations" | "roster" | "staff";
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
export function sanitizeSharedPrefs(prefs: PlaybookViewPrefs | null | undefined): PlaybookViewPrefs {
  if (!prefs) return {};
  const { typeFilter: _typeFilter, view: _view, ...rest } = prefs;
  void _typeFilter;
  void _view;
  return rest;
}

export async function getPlaybookViewPrefsAction(
  playbookId: string,
): Promise<{ ok: true; prefs: PlaybookViewPrefs | null } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("playbook_view_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("playbook_id", playbookId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, prefs: (data?.preferences as PlaybookViewPrefs) ?? null };
}

export async function setPlaybookViewPrefsAction(
  playbookId: string,
  prefs: PlaybookViewPrefs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("playbook_view_preferences")
    .upsert(
      {
        user_id: user.id,
        playbook_id: playbookId,
        preferences: prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,playbook_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Seed a recipient's prefs from the caller's current prefs for this playbook
 * — but only if the recipient doesn't already have a prefs row. Used by the
 * share flow when the coach shares a playbook with an existing user.
 *
 * First-visit-only: if the recipient already has prefs (prior access),
 * this is a no-op, so we never clobber their own edits.
 */
export async function seedPlaybookViewPrefsAction(
  playbookId: string,
  recipientUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Look up sharer's own prefs for this playbook.
  const { data: mine } = await supabase
    .from("playbook_view_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("playbook_id", playbookId)
    .maybeSingle();

  const prefs = sanitizeSharedPrefs(mine?.preferences as PlaybookViewPrefs | null);
  const { error } = await supabase.rpc("seed_playbook_view_prefs", {
    p_user_id: recipientUserId,
    p_playbook_id: playbookId,
    p_prefs: prefs,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
