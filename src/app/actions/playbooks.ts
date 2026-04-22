"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SportVariant } from "@/domain/play/types";
import {
  defaultSettingsForVariant,
  normalizePlaybookSettings,
  type PlaybookSettings,
} from "@/domain/playbook/settings";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import {
  FREE_MAX_PLAYBOOKS_OWNED,
  tierAtLeast,
} from "@/lib/billing/features";

const LOGO_BUCKET = "playbook-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

/**
 * Upload a playbook logo image to the public `playbook-logos` bucket and
 * return its public URL. Used by the create / appearance dialogs so users
 * can pick a local file instead of pasting a URL.
 */
export async function uploadPlaybookLogoAction(formData: FormData) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false as const, error: "No file provided." };
  }
  if (file.size === 0) {
    return { ok: false as const, error: "File is empty." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false as const, error: "Image must be 2 MB or smaller." };
  }
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return {
      ok: false as const,
      error: "Unsupported image type. Use PNG, JPG, WebP, SVG, or GIF.",
    };
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `${user.id}/${crypto.randomUUID()}.${ext || "bin"}`;

  const admin = createServiceRoleClient();
  const { error: upErr } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(key, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000",
    });
  if (upErr) return { ok: false as const, error: upErr.message };

  const { data: pub } = admin.storage.from(LOGO_BUCKET).getPublicUrl(key);
  return { ok: true as const, url: pub.publicUrl };
}

export type PlaybookRow = {
  id: string;
  name: string;
  sport_variant: string;
  season: string | null;
  created_at: string | null;
  updated_at: string | null;
  team_id: string;
  is_default: boolean;
  is_archived: boolean;
  play_count?: number;
};

/** List playbooks. Excludes the per-team "Inbox" (is_default) by default. */
export async function listPlaybooksAction(opts?: {
  includeDefault?: boolean;
  includeArchived?: boolean;
}) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", playbooks: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", playbooks: [] };

  await ensureDefaultWorkspace(supabase, user.id);

  let query = supabase
    .from("playbooks")
    .select("id, name, sport_variant, season, created_at, updated_at, team_id, is_default, is_archived")
    .order("updated_at", { ascending: false });

  if (!opts?.includeDefault) query = query.eq("is_default", false);
  if (!opts?.includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error) return { ok: false as const, error: error.message, playbooks: [] };
  return { ok: true as const, playbooks: (data ?? []) as PlaybookRow[] };
}

export async function createPlaybookAction(
  name: string,
  sportVariant: SportVariant = "flag_7v7",
  appearance?: { color?: string | null; logo_url?: string | null },
  customOffenseCount?: number | null,
  season?: string | null,
  settings?: PlaybookSettings | null,
) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const entitlement = await getUserEntitlement(user.id);
  if (!tierAtLeast(entitlement, "coach")) {
    const { count: ownedCount } = await supabase
      .from("playbook_members")
      .select("playbook_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "owner");
    if ((ownedCount ?? 0) >= FREE_MAX_PLAYBOOKS_OWNED) {
      return {
        ok: false as const,
        error: `Free tier is limited to ${FREE_MAX_PLAYBOOKS_OWNED} playbook. Upgrade to Coach to create more.`,
      };
    }
  }

  const color = appearance?.color?.trim() || null;
  const logo = appearance?.logo_url?.trim() || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { ok: false as const, error: "Color must be a hex like #RRGGBB." };
  }
  if (logo && !/^https?:\/\//i.test(logo)) {
    return { ok: false as const, error: "Logo must be an http(s) URL." };
  }

  // Only the "Other" (six_man) variant carries a custom player count. Clamp
  // to 4–11 and ignore the value for fixed variants.
  let offenseCount: number | null = null;
  if (sportVariant === "other" && typeof customOffenseCount === "number") {
    const n = Math.round(customOffenseCount);
    if (!Number.isFinite(n) || n < 4 || n > 11) {
      return { ok: false as const, error: "Player count must be between 4 and 11." };
    }
    offenseCount = n;
  }

  let teamId: string;
  try {
    const ws = await ensureDefaultWorkspace(supabase, user.id);
    teamId = ws.teamId;
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not resolve workspace.",
    };
  }

  const seasonClean = season?.trim().slice(0, 60) || null;

  const resolvedSettings =
    settings ?? defaultSettingsForVariant(sportVariant, offenseCount);

  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      team_id: teamId,
      name: name || "New playbook",
      sport_variant: sportVariant,
      color,
      logo_url: logo,
      custom_offense_count: offenseCount,
      season: seasonClean,
      settings: resolvedSettings,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };

  await supabase
    .from("playbook_members")
    .insert({ playbook_id: data.id, user_id: user.id, role: "owner" });

  return { ok: true as const, id: data.id };
}

export async function updatePlaybookAppearanceAction(
  playbookId: string,
  appearance: { logo_url: string | null; color: string | null },
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const logo = appearance.logo_url?.trim() || null;
  const color = appearance.color?.trim() || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { ok: false as const, error: "Color must be a hex like #RRGGBB." };
  }
  if (logo && !/^https?:\/\//i.test(logo)) {
    return { ok: false as const, error: "Logo must be an http(s) URL." };
  }

  const { error } = await supabase
    .from("playbooks")
    .update({ logo_url: logo, color })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function updatePlaybookSeasonAction(
  playbookId: string,
  season: string | null,
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const clean = season?.trim().slice(0, 60) || null;
  const { error } = await supabase
    .from("playbooks")
    .update({ season: clean })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function updatePlaybookSettingsAction(
  playbookId: string,
  settings: PlaybookSettings,
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  if (!Number.isFinite(settings.maxPlayers) || settings.maxPlayers < 1 || settings.maxPlayers > 15) {
    return { ok: false as const, error: "Max players must be between 1 and 15." };
  }
  if (settings.rushingAllowed && settings.rushingYards != null) {
    if (!Number.isFinite(settings.rushingYards) || settings.rushingYards < 0 || settings.rushingYards > 30) {
      return { ok: false as const, error: "Required rush yardage must be 0–30." };
    }
  }

  const payload: PlaybookSettings = {
    rushingAllowed: !!settings.rushingAllowed,
    rushingYards: settings.rushingAllowed ? settings.rushingYards ?? 0 : null,
    handoffsAllowed: !!settings.handoffsAllowed,
    blockingAllowed: !!settings.blockingAllowed,
    maxPlayers: Math.round(settings.maxPlayers),
  };

  const { error } = await supabase
    .from("playbooks")
    .update({ settings: payload })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function getPlaybookSettingsAction(
  playbookId: string,
): Promise<{ ok: true; settings: PlaybookSettings } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbooks")
    .select("sport_variant, custom_offense_count, settings")
    .eq("id", playbookId)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Not found" };
  const settings = normalizePlaybookSettings(
    data.settings,
    (data.sport_variant as SportVariant) ?? "flag_7v7",
    (data.custom_offense_count as number | null) ?? null,
  );
  return { ok: true, settings };
}

export async function renamePlaybookAction(playbookId: string, name: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase
    .from("playbooks")
    .update({ name: trimmed })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function archivePlaybookAction(playbookId: string, archived: boolean) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  // Guardrail: don't archive the Inbox — it has to exist for quick-create.
  const { data: book, error: selErr } = await supabase
    .from("playbooks")
    .select("is_default")
    .eq("id", playbookId)
    .single();
  if (selErr || !book) return { ok: false as const, error: selErr?.message ?? "Not found" };
  if (book.is_default) {
    return { ok: false as const, error: "Can't archive the default Inbox playbook." };
  }

  const { error } = await supabase
    .from("playbooks")
    .update({ is_archived: archived })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deletePlaybookAction(playbookId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: book, error: selErr } = await supabase
    .from("playbooks")
    .select("is_default")
    .eq("id", playbookId)
    .single();
  if (selErr || !book) return { ok: false as const, error: selErr?.message ?? "Not found" };
  if (book.is_default) {
    return { ok: false as const, error: "Can't delete the default Inbox playbook." };
  }

  const { error } = await supabase.from("playbooks").delete().eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/**
 * Deep-copy a playbook: duplicates every non-archived play and its current version document.
 * New playbook is created in the same team as the source.
 *
 * Non-owners can only duplicate if the owner has left `allow_duplication`
 * on (default). Owners can always duplicate their own books.
 */
export async function duplicatePlaybookAction(playbookId: string, newName?: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const entitlement = await getUserEntitlement(user.id);
  if (!tierAtLeast(entitlement, "coach")) {
    return {
      ok: false as const,
      error: "Duplicating playbooks is a Coach feature. Upgrade to unlock.",
    };
  }

  const { data: src, error: srcErr } = await supabase
    .from("playbooks")
    .select("id, team_id, name, sport_variant, custom_offense_count, color, logo_url, season, allow_coach_duplication, allow_player_duplication")
    .eq("id", playbookId)
    .single();
  if (srcErr || !src) return { ok: false as const, error: srcErr?.message ?? "Not found" };

  const { data: membership } = await supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  const isOwner = membership?.role === "owner";
  if (!isOwner) {
    const role = membership?.role;
    if (role === "editor" && src.allow_coach_duplication === false) {
      return { ok: false as const, error: "The owner has disabled duplication for coaches." };
    }
    if (role === "viewer" && src.allow_player_duplication === false) {
      return { ok: false as const, error: "The owner has disabled duplication for players." };
    }
    if (!role) {
      return { ok: false as const, error: "You don't have access to this playbook." };
    }
  }

  // The copy lives in the duplicator's own workspace so they own it, and so
  // the insert passes playbooks RLS (which gates on org ownership of the
  // target team). Duplicating into the source's team would only work for
  // its org owner.
  let targetTeamId: string;
  try {
    const ws = await ensureDefaultWorkspace(supabase, user.id);
    targetTeamId = ws.teamId;
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not resolve workspace.",
    };
  }

  const { data: newBook, error: pbErr } = await supabase
    .from("playbooks")
    .insert({
      team_id: targetTeamId,
      name: (newName?.trim() || `${src.name} (copy)`).slice(0, 120),
      sport_variant: src.sport_variant,
      custom_offense_count: src.custom_offense_count,
      color: src.color,
      logo_url: src.logo_url,
      season: src.season,
    })
    .select("id")
    .single();
  if (pbErr) return { ok: false as const, error: pbErr.message };

  await supabase
    .from("playbook_members")
    .insert({ playbook_id: newBook.id, user_id: user.id, role: "owner" });

  // Copy plays + current versions. Archived plays are skipped.
  const { data: plays, error: playsErr } = await supabase
    .from("plays")
    .select(
      "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tags, tag, current_version_id",
    )
    .eq("playbook_id", playbookId)
    .eq("is_archived", false);
  if (playsErr) return { ok: false as const, error: playsErr.message };

  for (const p of plays ?? []) {
    const { data: newPlay, error: insErr } = await supabase
      .from("plays")
      .insert({
        playbook_id: newBook.id,
        name: p.name,
        shorthand: p.shorthand,
        wristband_code: p.wristband_code,
        mnemonic: p.mnemonic,
        display_abbrev: p.display_abbrev,
        formation_name: p.formation_name,
        concept: p.concept,
        tags: p.tags ?? (p.tag ? [p.tag] : []),
        tag: p.tag,
      })
      .select("id")
      .single();
    if (insErr || !newPlay) continue;

    if (!p.current_version_id) continue;
    const { data: srcVer } = await supabase
      .from("play_versions")
      .select("document")
      .eq("id", p.current_version_id)
      .single();
    if (!srcVer) continue;

    const { data: newVer } = await supabase
      .from("play_versions")
      .insert({
        play_id: newPlay.id,
        schema_version: 1,
        document: srcVer.document,
        label: "copied",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (newVer) {
      await supabase
        .from("plays")
        .update({ current_version_id: newVer.id })
        .eq("id", newPlay.id);
    }
  }

  return { ok: true as const, id: newBook.id };
}

/**
 * Owner-only: toggle whether members of a given role (coach/player) may
 * duplicate this playbook. Coaches = editor role, players = viewer role.
 */
export async function setPlaybookAllowDuplicationAction(
  playbookId: string,
  target: "coach" | "player",
  allow: boolean,
) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: membership } = await supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "owner") {
    return { ok: false as const, error: "Only the owner can change this setting." };
  }

  const column =
    target === "coach" ? "allow_coach_duplication" : "allow_player_duplication";
  const { error } = await supabase
    .from("playbooks")
    .update({ [column]: allow })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/**
 * Remove the caller's membership from a playbook they don't own. Used by
 * the dashboard "Unsubscribe" action on shared books. Owners cannot leave
 * their own books — they must delete instead.
 */
export async function leavePlaybookAction(playbookId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: membership } = await supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { ok: false as const, error: "You're not a member of this playbook." };
  if (membership.role === "owner") {
    return { ok: false as const, error: "Owners can't unsubscribe — delete the playbook instead." };
  }

  const { error } = await supabase
    .from("playbook_members")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("user_id", user.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
