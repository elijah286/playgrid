"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getExamplesPageEnabled,
  setExamplesPageEnabled,
} from "@/lib/site/examples-config";

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
 * Flip the "this playbook is a public example" mark. Setting it on
 * shows the inline banner and unlocks the Publish action. Setting it
 * off also un-publishes (so nothing leaks once you decide a playbook
 * isn't an example anymore).
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
  revalidatePath("/examples");
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true as const, label: clean };
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
