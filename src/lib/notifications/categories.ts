/**
 * Push-notification categories — the single source of truth for both the send
 * path (push.ts gates each fan-out on a category) and the account-settings UI
 * (a toggle per category, backed by push_opt_outs).
 *
 * This module is deliberately dependency-free (no node:crypto, no Supabase) so
 * the client preferences card can import the metadata directly without dragging
 * server-only code into the bundle.
 *
 * Best-practice grouping: a handful of meaningful buckets rather than a switch
 * per event type. Too many switches is its own kind of noise — coaches stop
 * reading them. Everything defaults ON (opt-out model); `account` (security &
 * billing) is locked on because silencing a failed-payment or security alert
 * does more harm than the notification it suppresses.
 */

export const PUSH_CATEGORIES = [
  "team",
  "calendar",
  "roster_access",
  "shares_mentions",
  "account",
  "admin_ops",
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export type PushCategoryMeta = {
  label: string;
  description: string;
  /** "all" shows the toggle to every user; "admin" only to site admins. */
  audience: "all" | "admin";
  /** Critical alerts the user cannot opt out of (rendered on + disabled). */
  lockedOn?: boolean;
};

export const PUSH_CATEGORY_META: Record<PushCategory, PushCategoryMeta> = {
  team: {
    label: "Team activity",
    description: "New team messages and play updates from playbooks you're on.",
    audience: "all",
  },
  calendar: {
    label: "Schedule & RSVPs",
    description: "Practices, games, scrimmages, schedule changes, and RSVP reminders.",
    audience: "all",
  },
  roster_access: {
    label: "Requests & approvals",
    description:
      "Join requests, coach-access requests, and roster claims on playbooks you own.",
    audience: "all",
  },
  shares_mentions: {
    label: "Shares & mentions",
    description: "When a playbook is shared with you or someone @-mentions you.",
    audience: "all",
  },
  account: {
    label: "Account & security",
    description: "Billing and security alerts. Always on so you never miss a critical notice.",
    audience: "all",
    lockedOn: true,
  },
  admin_ops: {
    label: "Site operations",
    description: "New sign-ups, purchases, and cancellations across the site.",
    audience: "admin",
  },
};

export function isPushCategory(value: string): value is PushCategory {
  return (PUSH_CATEGORIES as readonly string[]).includes(value);
}
