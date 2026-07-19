"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { UX_PREVIEW_COOKIE, UX_PREVIEW_ON } from "@/lib/site/ux-preview";

/**
 * Per-user, per-session opt-in toggle for the new-UX preview shell.
 *
 * This ONLY flips a cookie. It does NOT grant access — availability is enforced
 * separately at render time (see `resolveUxPreview` / the `new_shell` beta flag
 * + allowlist). A user who isn't allowed can set this cookie and still see the
 * production UX, because the layout gate checks allowlist/admin regardless.
 *
 * The cookie is a SESSION cookie (no maxAge/expires) so it dies when the browser
 * session ends — combined with clearing it on sign-out, a fresh login always
 * defaults to the production experience, by design.
 */
export async function setUxPreviewActiveAction(on: boolean) {
  const store = await cookies();
  if (on) {
    store.set(UX_PREVIEW_COOKIE, UX_PREVIEW_ON, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // No maxAge/expires → session cookie (clears on browser close).
    });
  } else {
    store.delete(UX_PREVIEW_COOKIE);
  }
  // Re-render the shell so the ribbon + (future) new chrome reflect the change.
  revalidatePath("/", "layout");
  return { ok: true as const, active: on };
}

/** Read the current per-session toggle state (for the admin banner's initial UI). */
export async function getUxPreviewActiveAction() {
  const store = await cookies();
  return { ok: true as const, active: store.get(UX_PREVIEW_COOKIE)?.value === UX_PREVIEW_ON };
}
