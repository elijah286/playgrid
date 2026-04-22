"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import {
  getExamplesUserId,
  setExamplesUserId,
} from "@/lib/site/examples-config";
import {
  isExampleMakerCookieSet,
  resolveExampleMakerScope,
  setExampleMakerCookie,
} from "@/lib/examples/mode";

async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }
  return { ok: true as const, userId: user.id };
}

export async function getExamplesUserIdAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const id = await getExamplesUserId();
  return { ok: true as const, examplesUserId: id };
}

export async function setExamplesUserIdAction(userId: string | null) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const clean = userId?.trim() || null;
  if (clean !== null) {
    // Validate that the user actually exists as a profile.
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("id", clean)
      .maybeSingle();
    if (error) {
      return { ok: false as const, error: error.message };
    }
    if (!data) {
      return { ok: false as const, error: "No profile found for that user id." };
    }
  }
  try {
    await setExamplesUserId(clean);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
  // Turn mode off whenever the designated user changes, so nobody is
  // acting as a stale examples account.
  await setExampleMakerCookie(false);
  revalidatePath("/", "layout");
  return { ok: true as const, examplesUserId: clean };
}

export async function getExampleMakerModeAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: true as const, active: false, examplesUserId: null };
  const scope = await resolveExampleMakerScope();
  return {
    ok: true as const,
    active: scope.active,
    examplesUserId: scope.examplesUserId,
    cookieOn: await isExampleMakerCookieSet(),
  };
}

export async function setExampleMakerModeAction(on: boolean) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (on) {
    const id = await getExamplesUserId();
    if (!id) {
      return {
        ok: false as const,
        error:
          "Set an examples user in Site settings before entering example maker mode.",
      };
    }
  }
  await setExampleMakerCookie(on);
  revalidatePath("/", "layout");
  return { ok: true as const, active: on };
}

export async function setPlaybookPublicExampleAction(
  playbookId: string,
  isPublicExample: boolean,
) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const examplesUserId = await getExamplesUserId();
  if (!examplesUserId) {
    return {
      ok: false as const,
      error: "No examples user is configured.",
    };
  }
  const admin = createServiceRoleClient();
  // Confirm the playbook is actually owned by the examples user before
  // flipping the flag; we don't want admins accidentally publishing
  // somebody else's playbook to the public /examples page.
  const { data: owner, error: ownerErr } = await admin
    .from("playbook_members")
    .select("user_id, role")
    .eq("playbook_id", playbookId)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerErr) return { ok: false as const, error: ownerErr.message };
  if (!owner || owner.user_id !== examplesUserId) {
    return {
      ok: false as const,
      error: "Only playbooks owned by the examples user can be published.",
    };
  }
  const { error } = await admin
    .from("playbooks")
    .update({ is_public_example: isPublicExample })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/examples");
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const, isPublicExample };
}

/**
 * Deep-copy any playbook the admin can read into the examples user's
 * workspace so the admin can adapt it as a public example. Copies the
 * playbook metadata, all non-archived plays, and their current version
 * documents. The copy starts as a private draft (is_public_example=false)
 * and is owned by the examples user.
 *
 * Runs entirely through the service role client — admins don't have RLS
 * grants to read arbitrary other users' playbooks via their normal
 * session, and writes against the examples user's workspace need to
 * bypass membership checks anyway.
 */
export async function duplicatePlaybookToExamplesAction(
  sourcePlaybookId: string,
  newName?: string,
) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const examplesUserId = await getExamplesUserId();
  if (!examplesUserId) {
    return {
      ok: false as const,
      error: "No examples user is configured.",
    };
  }

  const svc = createServiceRoleClient();

  const { data: src, error: srcErr } = await svc
    .from("playbooks")
    .select(
      "id, name, sport_variant, custom_offense_count, color, logo_url, season, settings",
    )
    .eq("id", sourcePlaybookId)
    .maybeSingle();
  if (srcErr) return { ok: false as const, error: srcErr.message };
  if (!src) return { ok: false as const, error: "Source playbook not found." };

  let targetTeamId: string;
  try {
    const ws = await ensureDefaultWorkspace(svc, examplesUserId);
    targetTeamId = ws.teamId;
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not resolve examples workspace.",
    };
  }

  const { data: newBook, error: pbErr } = await svc
    .from("playbooks")
    .insert({
      team_id: targetTeamId,
      name: (newName?.trim() || `${src.name} (example)`).slice(0, 120),
      sport_variant: src.sport_variant,
      custom_offense_count: src.custom_offense_count,
      color: src.color,
      logo_url: src.logo_url,
      season: src.season,
      settings: src.settings,
      is_public_example: false,
    })
    .select("id")
    .single();
  if (pbErr || !newBook) {
    return { ok: false as const, error: pbErr?.message ?? "Failed to create copy." };
  }

  await svc
    .from("playbook_members")
    .insert({ playbook_id: newBook.id, user_id: examplesUserId, role: "owner" });

  const { data: plays, error: playsErr } = await svc
    .from("plays")
    .select(
      "id, name, shorthand, wristband_code, mnemonic, display_abbrev, formation_name, concept, tags, tag, current_version_id",
    )
    .eq("playbook_id", sourcePlaybookId)
    .eq("is_archived", false);
  if (playsErr) return { ok: false as const, error: playsErr.message };

  for (const p of plays ?? []) {
    const { data: newPlay, error: insErr } = await svc
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
    const { data: srcVer } = await svc
      .from("play_versions")
      .select("document")
      .eq("id", p.current_version_id)
      .maybeSingle();
    if (!srcVer) continue;

    const { data: newVer } = await svc
      .from("play_versions")
      .insert({
        play_id: newPlay.id,
        schema_version: 1,
        document: srcVer.document,
        label: "copied",
        created_by: examplesUserId,
      })
      .select("id")
      .single();
    if (newVer) {
      await svc
        .from("plays")
        .update({ current_version_id: newVer.id })
        .eq("id", newPlay.id);
    }
  }

  revalidatePath("/home");
  revalidatePath(`/playbooks/${newBook.id}`);
  return { ok: true as const, id: newBook.id };
}
