"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SportVariant } from "@/domain/play/types";
import type { TutorialId, TutorialStatus } from "@/features/tutorials/engine/types";
import {
  getTutorialProgress,
  listTutorialProgress,
  upsertTutorialProgress,
} from "@/lib/data/tutorial-progress";
import { createPlayAction } from "@/app/actions/plays";
import { createPracticePlanAction } from "@/app/actions/practice-plans";
import { assertNotLocked } from "@/lib/billing/downgrade-locks";
import {
  getPlaybookOwnerEntitlement,
  getPlaybookOwnerId,
} from "@/lib/billing/owner-entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { getFreePlayCapForOwner } from "@/lib/site/free-plays-config";

export async function getTutorialProgressAction(tutorialId: TutorialId) {
  const row = await getTutorialProgress(tutorialId);
  return { ok: true as const, progress: row };
}

export async function listTutorialProgressAction() {
  const rows = await listTutorialProgress();
  return { ok: true as const, progress: rows };
}

export async function upsertTutorialProgressAction(input: {
  tutorialId: TutorialId;
  status: TutorialStatus;
  stepIndex: number;
  variant: SportVariant | null;
}) {
  return upsertTutorialProgress(input);
}

/**
 * Create a fresh play in the given playbook for the Play Authoring tutorial.
 *
 * Tutorial entry points (Learning Center, editor action menu, second-visit
 * toast) all route through here so the coach always lands on a clean slate
 * — default players placed for the variant, no formation linked, no routes
 * drawn. That makes every step of the tour meaningful from scratch.
 */
export async function createTutorialPlayAction(playbookId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const { data: book } = await supabase
    .from("playbooks")
    .select("sport_variant")
    .eq("id", playbookId)
    .maybeSingle();
  const variant = (book?.sport_variant as SportVariant | undefined) ?? "flag_7v7";

  const res = await createPlayAction(playbookId, {
    variant,
    playName: "Tutorial play",
    isTutorial: true,
  });
  if (!res.ok) return { ok: false as const, error: res.error };
  return { ok: true as const, playId: res.playId };
}

/**
 * Create a fresh practice plan in the given playbook for the practice-plan
 * tutorial. The plan is empty (no blocks) so every step of the tour —
 * adding a block, setting time, adding a lane — has something to do.
 *
 * Practice plans don't have an `is_tutorial` flag (yet) so the plan is
 * a normal one named "Tutorial practice plan" the coach can rename or
 * delete after.
 */
export async function createTutorialPracticePlanAction(playbookId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const res = await createPracticePlanAction(playbookId, "Tutorial practice plan");
  if (!res.ok) return { ok: false as const, error: res.error };
  return { ok: true as const, planId: res.planId };
}

/**
 * Promote a tutorial play to a normal play in its playbook.
 *
 * Enforces the same gates as creating a fresh play (playbook lock check
 * + per-playbook play cap), so a coach on the free tier can't quietly
 * exceed their limit by repeatedly "keeping" tutorial plays. Counts
 * exclude the play being kept (it would only count once promoted).
 */
export async function keepTutorialPlayAction(playId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: play, error: playErr } = await supabase
    .from("plays")
    .select("id, playbook_id, is_tutorial, deleted_at")
    .eq("id", playId)
    .maybeSingle();
  if (playErr || !play) {
    return { ok: false as const, error: "Play not found." };
  }
  if (play.deleted_at) {
    return { ok: false as const, error: "This play has been deleted." };
  }
  if (!play.is_tutorial) {
    // Already promoted — treat as a no-op success so callers can be idempotent.
    return { ok: true as const };
  }

  const playbookId = play.playbook_id as string;
  const ownerId = await getPlaybookOwnerId(playbookId);
  if (ownerId) {
    const lock = await assertNotLocked({ ownerId, playbookId });
    if (!lock.ok) return { ok: false as const, error: lock.error };
  }

  // Inline cap check — promoting bumps the unlocked-play count by one.
  // `assertPlayCap` lives in plays.ts and isn't exported; replicating the
  // small check here keeps the dependency direction clean (tutorials →
  // plays only via the createPlayAction wrapper, not internals).
  const ownerEnt = ownerId
    ? await getPlaybookOwnerEntitlement(playbookId)
    : null;
  if (!ownerEnt || !tierAtLeast(ownerEnt, "coach")) {
    const limit = await getFreePlayCapForOwner(ownerId);
    const { count } = await supabase
      .from("plays")
      .select("id", { count: "exact", head: true })
      .eq("playbook_id", playbookId)
      .eq("is_archived", false)
      .eq("is_tutorial", false)
      .is("attached_to_play_id", null);
    if ((count ?? 0) >= limit) {
      return {
        ok: false as const,
        error: `Your playbook is full — free tier is capped at ${limit} plays per playbook. Upgrade to Team Coach, archive a play, or discard this tutorial play.`,
      };
    }
  }

  const { error: updateErr } = await supabase
    .from("plays")
    .update({ is_tutorial: false })
    .eq("id", playId)
    .eq("is_tutorial", true);
  if (updateErr) return { ok: false as const, error: updateErr.message };
  return { ok: true as const };
}

/**
 * Soft-delete a tutorial play. Used by the "Don't keep" affordance on
 * the in-editor tutorial banner — the play disappears like any other
 * deleted play and lives in the 30-day trash before being permanently
 * removed.
 */
export async function discardTutorialPlayAction(playId: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: play } = await supabase
    .from("plays")
    .select("id, is_tutorial, deleted_at")
    .eq("id", playId)
    .maybeSingle();
  if (!play) return { ok: false as const, error: "Play not found." };
  if (play.deleted_at) return { ok: true as const };
  if (!play.is_tutorial) {
    return {
      ok: false as const,
      error: "This isn't a tutorial play — use the normal delete flow.",
    };
  }

  const { error } = await supabase
    .from("plays")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", playId)
    .eq("is_tutorial", true);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
