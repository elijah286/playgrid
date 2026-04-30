"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getExamplesPageEnabled,
  setExamplesPageEnabled,
} from "@/lib/site/examples-config";
import { copyPlaybookContents } from "@/lib/data/playbook-copy";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";

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
  return { ok: true as const, supabase, userId: user.id };
}

async function assertAdminEditorOfPlaybook(playbookId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  // The admin must have a membership row granting them edit rights on
  // this playbook. We don't give admins blanket access to anyone else's
  // content — if they want to turn someone else's playbook into an
  // example, they duplicate it into their own workspace first.
  const { data: membership } = await gate.supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", gate.userId)
    .maybeSingle();
  const role = membership?.role as "owner" | "editor" | "viewer" | undefined;
  if (role !== "owner" && role !== "editor") {
    return {
      ok: false as const,
      error: "You can only use your own playbooks as examples.",
    };
  }
  return { ok: true as const, supabase: gate.supabase };
}

/**
 * Deep-copy a source playbook into a new playbook owned by the admin
 * and mark the copy as an example. The source is untouched, so admins
 * can keep editing their real playbook without those changes bleeding
 * into the published example. Returns the new playbook's id so the UI
 * can navigate the admin into the copy to tweak it.
 */
export async function duplicateAsExampleAction(sourcePlaybookId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const { data: src, error: srcErr } = await gate.supabase
    .from("playbooks")
    .select(
      "id, name, sport_variant, custom_offense_count, color, logo_url, season",
    )
    .eq("id", sourcePlaybookId)
    .maybeSingle();
  if (srcErr || !src) {
    return { ok: false as const, error: srcErr?.message ?? "Not found" };
  }

  let targetTeamId: string;
  try {
    const ws = await ensureDefaultWorkspace(gate.supabase, gate.userId);
    targetTeamId = ws.teamId;
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not resolve workspace.",
    };
  }

  const exampleName = `${src.name} (example)`.slice(0, 120);
  const { data: newBook, error: pbErr } = await gate.supabase
    .from("playbooks")
    .insert({
      team_id: targetTeamId,
      name: exampleName,
      sport_variant: src.sport_variant,
      custom_offense_count: src.custom_offense_count,
      color: src.color,
      logo_url: src.logo_url,
      season: src.season,
      is_example: true,
    })
    .select("id")
    .single();
  if (pbErr || !newBook) {
    return { ok: false as const, error: pbErr?.message ?? "Insert failed." };
  }

  const { error: memErr } = await gate.supabase
    .from("playbook_members")
    .insert({ playbook_id: newBook.id, user_id: gate.userId, role: "owner" });
  if (memErr) return { ok: false as const, error: memErr.message };

  await copyPlaybookContents(
    gate.supabase,
    sourcePlaybookId,
    newBook.id,
    gate.userId,
  );

  revalidatePath("/home");
  revalidatePath("/examples");
  return { ok: true as const, id: newBook.id as string };
}

/**
 * Flip the "this playbook is a public example" mark. Used to clear the
 * flag on an example playbook (e.g. "Remove as example" on a copy that
 * was created via duplicateAsExampleAction). Setting it off also
 * un-publishes so nothing leaks.
 */
export async function setPlaybookIsExampleAction(
  playbookId: string,
  isExample: boolean,
) {
  const gate = await assertAdminEditorOfPlaybook(playbookId);
  if (!gate.ok) return gate;

  const update: { is_example: boolean; is_public_example?: boolean } = {
    is_example: isExample,
  };
  if (!isExample) update.is_public_example = false;

  const { error } = await gate.supabase
    .from("playbooks")
    .update(update)
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/home");
  revalidatePath("/examples");
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const, isExample };
}

/**
 * Toggle publish on a playbook that's already marked as an example.
 * Returns an error if the playbook isn't an example yet — the caller
 * should mark it first.
 */
export async function setPlaybookPublicExampleAction(
  playbookId: string,
  isPublicExample: boolean,
) {
  const gate = await assertAdminEditorOfPlaybook(playbookId);
  if (!gate.ok) return gate;

  if (isPublicExample) {
    const { data: book } = await gate.supabase
      .from("playbooks")
      .select("is_example")
      .eq("id", playbookId)
      .maybeSingle();
    if (!book?.is_example) {
      return {
        ok: false as const,
        error: "Mark this playbook as an example before publishing.",
      };
    }
  }

  const { error } = await gate.supabase
    .from("playbooks")
    .update({ is_public_example: isPublicExample })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/home");
  revalidatePath("/examples");
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const, isPublicExample };
}

/**
 * Admin-editable label shown as the "author" on /examples cards —
 * e.g. "Coach Jane" or "You!". Free text; nullable (blank → no label).
 */
export async function setPlaybookExampleAuthorLabelAction(
  playbookId: string,
  label: string | null,
) {
  const gate = await assertAdminEditorOfPlaybook(playbookId);
  if (!gate.ok) return gate;

  const clean = label?.trim().slice(0, 60) || null;
  const { error } = await gate.supabase
    .from("playbooks")
    .update({ example_author_label: clean })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/home");
  revalidatePath("/examples");
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const, label: clean };
}

/**
 * Promote a published example playbook to the home-page hero shot — or
 * un-set the current hero. Single-selection: setting a new hero atomically
 * clears any existing hero. The unique partial index on
 * is_hero_marketing_example enforces this at the DB layer too.
 *
 * Caller must already have marked the playbook as a public example. We
 * don't auto-mark because hero is a downstream choice, not the same
 * decision.
 */
export async function setPlaybookHeroExampleAction(
  playbookId: string,
  isHero: boolean,
) {
  const gate = await assertAdminEditorOfPlaybook(playbookId);
  if (!gate.ok) return gate;

  if (isHero) {
    const { data: book } = await gate.supabase
      .from("playbooks")
      .select("is_public_example")
      .eq("id", playbookId)
      .maybeSingle();
    if (!book?.is_public_example) {
      return {
        ok: false as const,
        error: "Publish this example before making it the hero.",
      };
    }

    // Clear any existing hero first, then set the new one. The partial
    // unique index would reject the set otherwise.
    const { error: clearErr } = await gate.supabase
      .from("playbooks")
      .update({ is_hero_marketing_example: false })
      .eq("is_hero_marketing_example", true);
    if (clearErr) return { ok: false as const, error: clearErr.message };
  }

  const { error } = await gate.supabase
    .from("playbooks")
    .update({ is_hero_marketing_example: isHero })
    .eq("id", playbookId);
  if (error) return { ok: false as const, error: error.message };

  // Home page reads the hero — bust the layout cache so visitors see the
  // new selection on next render.
  revalidatePath("/", "layout");
  revalidatePath("/home");
  revalidatePath("/examples");
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const, isHero };
}

export async function getExamplesPageEnabledAction() {
  if (!hasSupabaseEnv()) return { ok: true as const, enabled: false };
  const enabled = await getExamplesPageEnabled();
  return { ok: true as const, enabled };
}

export async function setExamplesPageEnabledAction(enabled: boolean) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  try {
    await setExamplesPageEnabled(enabled);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
  revalidatePath("/", "layout");
  revalidatePath("/examples");
  return { ok: true as const, enabled };
}
