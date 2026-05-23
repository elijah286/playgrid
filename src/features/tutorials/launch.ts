"use client";

import {
  createTutorialPlayAction,
  createTutorialPracticePlanAction,
} from "@/app/actions/tutorials";
import type { TutorialId } from "./engine/types";

type RouterLike = { push: (url: string) => void };

/**
 * Single entry point for launching any tutorial from outside the surface
 * it runs in (Learning Center cards, in-app prompts). Creates the
 * appropriate scratch resource for the tutorial, then navigates to that
 * resource's editor with `?tour=<tutorialId>`. The destination surface's
 * auto-launcher reads the query param on mount, force-starts the matching
 * tour, and strips the param so a refresh doesn't re-trigger.
 */
export async function launchTutorial(
  tutorialId: TutorialId,
  playbookId: string,
  router: RouterLike,
): Promise<{ ok: boolean; error?: string }> {
  switch (tutorialId) {
    case "play_authoring_v1":
    case "defense_v1":
    case "formations_v1": {
      const res = await createTutorialPlayAction(playbookId);
      if (!res.ok) return { ok: false, error: res.error };
      router.push(`/plays/${res.playId}/edit?tour=${tutorialId}`);
      return { ok: true };
    }
    case "practice_plan_v1": {
      const res = await createTutorialPracticePlanAction(playbookId);
      if (!res.ok) return { ok: false, error: res.error };
      router.push(`/practice-plans/${res.planId}/edit?tour=${tutorialId}`);
      return { ok: true };
    }
    case "game_mode_v1": {
      // Game Mode runs against the live session for the playbook — no
      // separate scratch resource. Entitlement (Coach+ tier) is enforced
      // by the /game route; non-entitled users will be redirected to
      // /pricing on landing.
      router.push(`/playbooks/${playbookId}/game?tour=${tutorialId}`);
      return { ok: true };
    }
  }
}

/** Back-compat alias for callers that still launch the play-editor tutorial
 *  through this name. New callers should use `launchTutorial`. */
export function launchEditorTutorial(
  tutorialId: TutorialId,
  playbookId: string,
  router: RouterLike,
): Promise<{ ok: boolean; error?: string }> {
  return launchTutorial(tutorialId, playbookId, router);
}

/** Back-compat alias for the original single-tutorial entry point. */
export function launchPlayAuthoringTour(
  playbookId: string,
  router: RouterLike,
): Promise<{ ok: boolean; error?: string }> {
  return launchTutorial("play_authoring_v1", playbookId, router);
}
