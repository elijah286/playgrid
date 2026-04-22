"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
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
