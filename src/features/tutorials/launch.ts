"use client";

import { createTutorialPlayAction } from "@/app/actions/tutorials";

type RouterLike = { push: (url: string) => void };

/**
 * Single entry point used by every Play Authoring tour launcher (Learning
 * Center, editor action menu, second-visit toast).
 *
 * Creates a fresh play in the given playbook and navigates to the editor
 * with `?tour=play_authoring_v1` — the editor's auto-launcher reads the
 * query param on mount and force-starts the tour. The query param is
 * stripped after triggering so refreshing doesn't re-start.
 *
 * The user always lands on a clean slate so every step of the tour
 * (formation, route templates, route toolbar, etc.) is meaningful from
 * scratch.
 */
export async function launchPlayAuthoringTour(
  playbookId: string,
  router: RouterLike,
): Promise<{ ok: boolean; error?: string }> {
  const res = await createTutorialPlayAction(playbookId);
  if (!res.ok) return { ok: false, error: res.error };
  router.push(`/plays/${res.playId}/edit?tour=play_authoring_v1`);
  return { ok: true };
}
