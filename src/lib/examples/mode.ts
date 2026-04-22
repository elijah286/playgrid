import { cookies } from "next/headers";

import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { getExamplesUserId } from "@/lib/site/examples-config";

export const EXAMPLE_MAKER_COOKIE = "pg_example_maker";

export async function isExampleMakerCookieSet(): Promise<boolean> {
  const store = await cookies();
  return store.get(EXAMPLE_MAKER_COOKIE)?.value === "1";
}

export async function setExampleMakerCookie(on: boolean): Promise<void> {
  const store = await cookies();
  if (on) {
    store.set(EXAMPLE_MAKER_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // No maxAge — session cookie. Clears on browser close, and admins can
      // exit explicitly from the banner.
    });
  } else {
    store.delete(EXAMPLE_MAKER_COOKIE);
  }
}

export type ExampleMakerScope =
  | { active: false; examplesUserId: string | null }
  | { active: true; examplesUserId: string };

/**
 * Returns the active authoring scope for the current request. When an admin
 * has turned on example maker mode AND an examples user is configured, the
 * scope is "active" and callers should route playbook reads/writes through
 * the service-role client using examplesUserId instead of the admin's own
 * user.id. Any other caller gets {active: false}.
 */
export async function resolveExampleMakerScope(): Promise<ExampleMakerScope> {
  const [cookieOn, { profile }, examplesUserId] = await Promise.all([
    isExampleMakerCookieSet(),
    getCurrentUserProfile(),
    getExamplesUserId(),
  ]);
  if (!cookieOn) return { active: false, examplesUserId };
  if (profile?.role !== "admin") return { active: false, examplesUserId };
  if (!examplesUserId) return { active: false, examplesUserId: null };
  return { active: true, examplesUserId };
}
