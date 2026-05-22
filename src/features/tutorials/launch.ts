"use client";

import { createTutorialPlayAction } from "@/app/actions/tutorials";
import type { TutorialId } from "./engine/types";

type RouterLike = { push: (url: string) => void };

/**
 * Launch a tutorial that runs inside the play editor. Creates a fresh
 * tutorial play in the given playbook, then navigates to the editor with
 * `?tour=<tutorialId>`. The editor's auto-launcher reads the query param
 * on mount, force-starts the matching tour, and strips the param so a
 * refresh doesn't re-trigger.
 *
 * The user always lands on a clean slate (default players for the variant,
 * no formation, no routes) so every step is meaningful from scratch.
 */
export async function launchEditorTutorial(
  tutorialId: TutorialId,
  playbookId: string,
  router: RouterLike,
): Promise<{ ok: boolean; error?: string }> {
  const res = await createTutorialPlayAction(playbookId);
  if (!res.ok) return { ok: false, error: res.error };
  router.push(`/plays/${res.playId}/edit?tour=${tutorialId}`);
  return { ok: true };
}

/** Back-compat alias for the original single-tutorial entry point. */
export function launchPlayAuthoringTour(
  playbookId: string,
  router: RouterLike,
): Promise<{ ok: boolean; error?: string }> {
  return launchEditorTutorial("play_authoring_v1", playbookId, router);
}
