"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  SELECTED_TEAM_COOKIE,
  ALL_TEAMS,
} from "@/features/preview-shell/selected-team";

/**
 * Set the team the new-UX shell is scoped to (a playbook id, or ALL_TEAMS).
 * Pure presentation state — it does not grant access to anything; the layout
 * still enforces membership via the same server actions/RLS. Re-renders the
 * /app subtree so the current screen re-scopes in place (no navigation home).
 */
export async function setSelectedTeamAction(value: string) {
  const store = await cookies();
  store.set(SELECTED_TEAM_COOKIE, value || ALL_TEAMS, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/app", "layout");
  return { ok: true as const };
}
