/**
 * Repair a stuck app-icon badge on builds that can't set it themselves.
 *
 * Two halves ship the icon badge: the server sets `aps.badge` on every push
 * (works on any build — it's just a payload field), and `NativeBadgeSync` syncs
 * the icon to the live count while the app is open. The second half needs the
 * `@capawesome/capacitor-badge` native plugin, which only exists from iOS 1.1.0
 * (build 12). On every earlier install the badge is therefore a ONE-WAY RATCHET:
 * pushes raise it, nothing lowers it. A coach who got a push for a pending item
 * and then resolved it keeps a "1" over an empty inbox, permanently.
 *
 * APNs is the only lever left on those builds, so we clear the badge the same
 * way it was set: a badge-only push (`{aps:{badge:N}}` — no alert, no sound, so
 * it's delivered silently at priority 10 and updates the icon without a banner).
 *
 * iOS only, deliberately. An Android launcher badge is derived from the active
 * notification, not from a number we own, so there's no equivalent lever — and
 * FCM has no banner-less badge write. Android stays best-effort, as it already
 * was.
 *
 * The count is always derived server-side from the shared inbox derivation
 * (`computeInboxBadgeCount`) — never taken from the caller — so this can't be
 * used to write an arbitrary badge onto someone's phone.
 */
import { computeInboxBadgeCount } from "@/lib/inbox/derive";
import { loadApnsConfig } from "@/lib/site/apns-config";
import { sendApnsToTokens } from "@/lib/notifications/apns";
import type { createServiceRoleClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createServiceRoleClient>;

type BadgeTokenRow = {
  id: string;
  token: string;
  last_badge: number | null;
};

export type ReconcileResult =
  /** A badge-only push went out to `pushed` device(s). */
  | { ok: true; status: "reconciled"; count: number; pushed: number }
  /** Every device already shows the right number — nothing sent. */
  | { ok: true; status: "already-current"; count: number }
  /** No iOS devices, push not configured, or the count couldn't be derived. */
  | { ok: true; status: "skipped"; reason: string }
  | { ok: false; error: string };

/**
 * Bring `userId`'s iOS icon badge(s) in line with their live inbox count.
 *
 * Idempotent by construction: a token is only pushed when the derived count
 * differs from `last_badge` (the value we last delivered to it), so repeated
 * calls — a 60s poll, a reload loop — collapse to zero sends. A token we've
 * never badged (`last_badge IS NULL`) with a count of 0 has nothing stuck on it,
 * so it's skipped too.
 *
 * Best-effort throughout: never throws.
 */
export async function reconcileBadgeForUser(
  admin: Admin,
  userId: string,
): Promise<ReconcileResult> {
  try {
    const cfg = await loadApnsConfig(admin);
    if (!cfg) return { ok: true, status: "skipped", reason: "apns-not-configured" };

    const { data, error } = await admin
      .from("device_tokens")
      .select("id, token, last_badge")
      .eq("user_id", userId)
      .eq("platform", "ios")
      .is("disabled_at", null);
    if (error) return { ok: false, error: error.message };

    const tokens = (data ?? []) as BadgeTokenRow[];
    if (tokens.length === 0) {
      return { ok: true, status: "skipped", reason: "no-ios-devices" };
    }

    // Derive server-side; the caller never supplies the number.
    const count = await computeInboxBadgeCount(admin, userId);
    if (typeof count !== "number") {
      return { ok: true, status: "skipped", reason: "count-underivable" };
    }

    const stale = tokens.filter((t) => {
      // Never badged and nothing to show → the icon is already clean.
      if (t.last_badge === null) return count > 0;
      return t.last_badge !== count;
    });
    if (stale.length === 0) return { ok: true, status: "already-current", count };

    // title/body empty → buildApnsPayload emits no alert and no sound, so this
    // lands as a badge-only push: the icon updates, nothing is shown.
    const { delivered, deadTokenIds } = await sendApnsToTokens(
      cfg,
      stale.map((t) => ({ id: t.id, token: t.token, badge: count })),
      { title: "", body: "", badge: count },
    );

    const deadIds = new Set(deadTokenIds);
    const reachable = stale.filter((t) => !deadIds.has(t.id));
    // Record the badge ONLY when every reachable token was actually delivered
    // to. APNs reports a delivered *count* and the dead tokens, but not which
    // individual sends succeeded — so on a partial (transient) failure we can't
    // attribute it, and guessing would strand the very bug this repairs:
    // recording a badge we never delivered makes the next reconcile a no-op and
    // leaves the icon stuck for good. Recording nothing just costs one more
    // silent badge push on the next tick.
    if (reachable.length > 0 && delivered === reachable.length) {
      await admin
        .from("device_tokens")
        .update({ last_badge: count })
        .in(
          "id",
          reachable.map((t) => t.id),
        );
    }
    if (deadTokenIds.length > 0) {
      await admin
        .from("device_tokens")
        .update({ disabled_at: new Date().toISOString(), disabled_reason: "apns_unregistered" })
        .in("id", deadTokenIds);
    }

    return { ok: true, status: "reconciled", count, pushed: delivered };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "reconcile failed" };
  }
}
