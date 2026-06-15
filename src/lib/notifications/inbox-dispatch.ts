import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendPushToUsers, type PushMessage } from "@/lib/notifications/push";
import type { PushCategory } from "@/lib/notifications/categories";

type Admin = ReturnType<typeof createServiceRoleClient>;

/**
 * Inbox → native push dispatch.
 *
 * The in-app inbox is a *derived* feed (no central "item created" row), so
 * "everything in the inbox pushes by default" is implemented by hooking each
 * source event to one of the helpers below. They are the single path between an
 * inbox-worthy event and a device push: each resolves the right recipients,
 * tags the send with a category (so the user's account-settings opt-out is
 * honoured by sendPushToUsers), and stays best-effort — the in-app row / email
 * remains the source of truth, exactly like the existing calendar/team pushes.
 */

/** Active owners of a playbook, minus the user who triggered the event. */
async function activeOwnerIds(
  admin: Admin,
  playbookId: string,
  excludeUserId: string | null,
): Promise<string[]> {
  const { data } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", playbookId)
    .eq("role", "owner")
    .eq("status", "active");
  return (data ?? [])
    .map((m) => m.user_id as string | null)
    .filter((id): id is string => Boolean(id) && id !== excludeUserId);
}

/**
 * Push an owner-facing inbox alert (join request, coach-access request, roster
 * claim) to every active owner of the playbook except the requester.
 */
export async function notifyPlaybookOwners(opts: {
  admin: Admin;
  playbookId: string;
  excludeUserId: string | null;
  category: PushCategory;
  message: PushMessage;
}): Promise<void> {
  const ownerIds = await activeOwnerIds(opts.admin, opts.playbookId, opts.excludeUserId);
  if (ownerIds.length === 0) return;
  await sendPushToUsers({
    admin: opts.admin,
    userIds: ownerIds,
    category: opts.category,
    message: opts.message,
  });
}

/** Push a single-recipient inbox alert (share/copy invite, @-mention). */
export async function notifyUser(opts: {
  admin: Admin;
  userId: string;
  category: PushCategory;
  message: PushMessage;
}): Promise<void> {
  if (!opts.userId) return;
  await sendPushToUsers({
    admin: opts.admin,
    userIds: [opts.userId],
    category: opts.category,
    message: opts.message,
  });
}

// Operational notices worth a device push to site admins. play_milestone is
// deliberately excluded — it's engagement telemetry for the in-app feed, not a
// device-interrupt-worthy event, and pushing it would be exactly the noise we
// want to avoid.
const ADMIN_PUSH_NOTICE_KINDS = [
  "user_signup",
  "subscription_purchased",
  "subscription_canceled",
] as const;

type ClaimedNotice = {
  id: string;
  kind: string;
  body: string;
  user_display_name: string | null;
  user_email: string | null;
  href: string | null;
};

function adminPushMessage(n: ClaimedNotice): PushMessage {
  const who = (n.user_display_name?.trim() || n.user_email || "Someone").trim();
  switch (n.kind) {
    case "user_signup":
      // body already reads e.g. "Jakob signed up" — don't double the name.
      return { title: "New sign-up 🎉", body: n.body, link: n.href ?? "/admin/users" };
    case "subscription_purchased":
      return { title: "New purchase 💳", body: `${who} ${n.body}`, link: n.href ?? "/admin/users" };
    case "subscription_canceled":
      return { title: "Subscription canceled", body: `${who} ${n.body}`, link: n.href ?? "/admin/users" };
    default:
      return { title: "Site update", body: n.body, link: n.href ?? "/admin/users" };
  }
}

/**
 * Project freshly-written system_notices to a device push for every site admin.
 *
 * system_notices is the canonical, deduplicated event feed (its SECURITY
 * DEFINER triggers already decide what counts as a purchase vs a cancel). This
 * is a pure downstream projection: it never re-derives the event, it just reads
 * the notice rows the triggers wrote and fans them out. Called at the two
 * touchpoints that run *after* the trigger has committed the notice in the same
 * transaction — the auth callback (signup) and the Stripe webhook (sub change).
 *
 * Idempotent by construction: each notice is claimed with an atomic
 * `update ... where pushed_at is null returning ...`, so a repeated callback or
 * a duplicate webhook can never double-notify. Recency-bounded so old notices
 * (e.g. backfilled before this shipped) are never retro-pushed.
 */
export async function projectSystemNoticesToAdmins(opts: {
  admin: Admin;
  userId: string;
  /** How far back a notice may be and still push. Default 10 minutes. */
  maxAgeMs?: number;
}): Promise<{ pushed: number }> {
  const { admin, userId } = opts;
  const sinceIso = new Date(Date.now() - (opts.maxAgeMs ?? 10 * 60 * 1000)).toISOString();

  // Atomic claim: only the rows this call flips from null win the returning set.
  const { data: claimed } = await admin
    .from("system_notices")
    .update({ pushed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("pushed_at", null)
    .in("kind", ADMIN_PUSH_NOTICE_KINDS as unknown as string[])
    .gte("created_at", sinceIso)
    .select("id, kind, body, user_display_name, user_email, href");

  return { pushed: await fanNoticesToAdmins(admin, (claimed ?? []) as ClaimedNotice[]) };
}

/**
 * Path-independent safety net: claim and push EVERY recent unpushed admin
 * notice, regardless of which signup/purchase flow created it.
 *
 * The per-touchpoint hooks (auth callback, Stripe webhook) only fire for
 * signups/changes that traverse those exact routes — native social sign-in,
 * implicit-flow OAuth, and delayed email confirmations bypass them, so their
 * notices were written by the DB trigger but never pushed. This sweep, driven
 * by a frequent cron, reads the canonical system_notices feed directly and
 * guarantees coverage. Idempotent via the same pushed_at claim, and
 * recency-bounded so it never floods on an old backlog.
 */
export async function sweepUnpushedAdminNotices(opts: {
  admin: Admin;
  /** How far back an unpushed notice may be and still push. Default 30 min. */
  maxAgeMs?: number;
}): Promise<{ pushed: number }> {
  const { admin } = opts;
  const sinceIso = new Date(Date.now() - (opts.maxAgeMs ?? 30 * 60 * 1000)).toISOString();

  const { data: claimed } = await admin
    .from("system_notices")
    .update({ pushed_at: new Date().toISOString() })
    .is("pushed_at", null)
    .in("kind", ADMIN_PUSH_NOTICE_KINDS as unknown as string[])
    .gte("created_at", sinceIso)
    .select("id, kind, body, user_display_name, user_email, href");

  return { pushed: await fanNoticesToAdmins(admin, (claimed ?? []) as ClaimedNotice[]) };
}

/** Fan a set of already-claimed notices out to every site admin's devices. */
async function fanNoticesToAdmins(admin: Admin, notices: ClaimedNotice[]): Promise<number> {
  if (notices.length === 0) return 0;

  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  const adminIds = (admins ?? [])
    .map((a) => a.id as string | null)
    .filter((id): id is string => Boolean(id));
  if (adminIds.length === 0) return 0;

  for (const n of notices) {
    await sendPushToUsers({
      admin,
      userIds: adminIds,
      category: "admin_ops",
      message: adminPushMessage(n),
    });
  }
  return notices.length;
}
