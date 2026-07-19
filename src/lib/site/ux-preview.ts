import { cookies } from "next/headers";
import {
  getBetaFeatures,
  getBetaFeatureAllowlistEmails,
  type BetaFeatureScope,
} from "@/lib/site/beta-features-config";

/**
 * New-UX preview gating.
 *
 * TWO independent layers, deliberately:
 *   1. AVAILABILITY ("allowed") — governed by the `new_shell` beta flag scope +
 *      allowlist. Controls who is even permitted to preview. Admins manage this
 *      from Site Admin → Overview.
 *   2. ACTIVE STATE ("active") — a per-session cookie the user flips on/off. It
 *      defaults OFF (absent = production), so login always defaults to the
 *      production experience. The user opts in explicitly and can flip back
 *      from anywhere (the ribbon) or the admin banner.
 *
 * The new UX renders only when BOTH are true. While the flag is "off" (the
 * default), this resolves to {allowed:false, active:false} with essentially no
 * extra work, so every other user is completely unaffected.
 */
export const UX_PREVIEW_COOKIE = "xo_ux_preview";
export const UX_PREVIEW_ON = "new";

export type UxPreviewState = { allowed: boolean; active: boolean };

export async function resolveUxPreview(args: {
  isAuthed: boolean;
  userRole: string | null;
  userEmail: string | null;
}): Promise<UxPreviewState> {
  const { isAuthed, userRole, userEmail } = args;
  if (!isAuthed) return { allowed: false, active: false };

  let scope: BetaFeatureScope;
  try {
    scope = (await getBetaFeatures()).new_shell;
  } catch {
    return { allowed: false, active: false };
  }
  // Off is the default for everyone — bail immediately, no allowlist query,
  // no cookie read, zero cost on the common path.
  if (scope === "off") return { allowed: false, active: false };

  const isAdmin = userRole === "admin";
  let allowed = false;
  if (isAdmin || scope === "all") {
    // Admins always keep access (so they can't lock themselves out under
    // "custom"); "all" = every authenticated user.
    allowed = true;
  } else if (scope === "custom" && userEmail) {
    try {
      const list = await getBetaFeatureAllowlistEmails("new_shell");
      const email = userEmail.toLowerCase();
      allowed = list.some((e) => e.toLowerCase() === email);
    } catch {
      allowed = false;
    }
  }
  // scope === "me" with a non-admin falls through as not-allowed.

  if (!allowed) return { allowed: false, active: false };

  const store = await cookies();
  const active = store.get(UX_PREVIEW_COOKIE)?.value === UX_PREVIEW_ON;
  return { allowed: true, active };
}
